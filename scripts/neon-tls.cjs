// TLS proof for remote (Neon) operator tools. Fail closed.
//
// Why pg_stat_ssl alone is not evidence on Neon: clients reach Postgres through the Neon proxy.
//   client ──TLS (verified)──▶ Neon proxy ──internal network──▶ Postgres compute
// pg_stat_ssl is filled by Postgres and describes only the proxy→compute hop, so it reports ssl = false
// (peer = private address) even when the client connection is TLS. That hop is outside the client's control.
//
// What proves the client→Neon leg instead (all three are required):
//   1. Driver policy (Prisma 5.10): the URL must carry sslmode=require AND sslaccept=strict, nothing weaker.
//      Measured offline against a local fake server (tests/prisma-tls-behavior.test.cjs):
//        - sslmode=require                    → refuses plaintext, but ACCEPTS self-signed/any certificate;
//        - sslmode=require&sslaccept=strict   → refuses plaintext, untrusted chains and host-name mismatch;
//        - sslmode=verify-full / verify-ca    → NOT supported by Prisma: silently behaves like "prefer"
//                                               (falls back to plaintext and accepts any certificate).
//   2. Client-side handshake probe on the same host: SSLRequest → 'S' → TLS ≥ 1.2 with certificate chain and
//      host-name verification (node:tls, rejectUnauthorized). Sends no user, database or password.
//   3. Plaintext refusal probe: a StartupMessage without TLS (dummy user, no password) must be refused by the
//      endpoint. If the server ever asks for a password the socket is closed without answering.
// The session view (pg_stat_ssl + pg_stat_activity of pg_backend_pid()) is kept as evidence and accepted only as
// ssl = true, or ssl = false from a private/loopback peer on a Neon server (the proxy hop) after 1–3 passed.
const net = require('node:net');
const tls = require('node:tls');

const PORT = 5432;
const TIMEOUT_MS = 15000;

function sslRequest() {
  const buffer = Buffer.alloc(8);
  buffer.writeInt32BE(8, 0);
  buffer.writeInt32BE(80877103, 4);
  return buffer;
}

function startupMessage(params) {
  const body = Buffer.concat([
    ...Object.entries(params).flatMap(([key, value]) => [Buffer.from(`${key}\0`), Buffer.from(`${value}\0`)]),
    Buffer.from('\0'),
  ]);
  const header = Buffer.alloc(8);
  header.writeInt32BE(8 + body.length, 0);
  header.writeInt32BE(196608, 4); // protocol 3.0
  return Buffer.concat([header, body]);
}

/** Parses one backend message: ErrorResponse -> { type: 'E', fields }, anything else -> { type }; null if incomplete. */
function parseBackendMessage(buffer) {
  if (buffer.length < 5) return null;
  const type = String.fromCharCode(buffer[0]);
  const length = buffer.readInt32BE(1);
  if (buffer.length < 1 + length) return null;
  if (type !== 'E') return { type };
  const fields = {};
  let offset = 5;
  while (offset < 1 + length && buffer[offset] !== 0) {
    const code = String.fromCharCode(buffer[offset]);
    const end = buffer.indexOf(0, offset + 1);
    fields[code] = buffer.subarray(offset + 1, end).toString('utf8');
    offset = end + 1;
  }
  return { type, fields };
}

/** Classifies an address without exposing it. */
function addressClass(ip) {
  if (!ip) return 'none';
  const v4 = String(ip).replace(/^::ffff:/, '');
  if (/^127\./.test(v4) || v4 === '::1') return 'loopback';
  if (/^10\./.test(v4) || /^192\.168\./.test(v4) || /^172\.(1[6-9]|2\d|3[01])\./.test(v4) || /^169\.254\./.test(v4)) return 'private';
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(v4)) return 'private'; // carrier-grade NAT range used by clouds
  if (/^f[cd][0-9a-f]{2}:/i.test(v4) || /^fe80:/i.test(v4)) return 'private';
  return 'public';
}

/** Throws unless the Prisma URL enforces TLS with certificate and host-name verification. */
function assertStrictTlsUrl(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new Error('TARGET_TLS_DRIVER_NOT_STRICT'); }
  const params = url.searchParams;
  if (params.getAll('sslmode').length !== 1 || params.get('sslmode') !== 'require') throw new Error('TARGET_TLS_DRIVER_NOT_STRICT');
  if (params.getAll('sslaccept').length !== 1 || params.get('sslaccept') !== 'strict') throw new Error('TARGET_TLS_DRIVER_NOT_STRICT');
  for (const name of ['sslcert', 'sslidentity', 'sslpassword']) if (params.has(name)) throw new Error('TARGET_TLS_DRIVER_NOT_STRICT');
  return { sslmode: 'require', sslaccept: 'strict' };
}

function settleOnce(executor) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = fn => value => { if (!settled) { settled = true; fn(value); } };
    executor(done(resolve), done(reject));
  });
}

/** SSLRequest + verified TLS handshake. Sends nothing else. */
function tlsProbe(host, { port = PORT, timeoutMs = TIMEOUT_MS, tlsOptions = {} } = {}) {
  return settleOnce((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('TLS_PROBE_TIMEOUT')); }, timeoutMs);
    const fail = code => error => { clearTimeout(timer); socket.destroy(); reject(Object.assign(new Error(code), { detail: error?.code || null })); };
    socket.once('error', fail('TLS_PROBE_NETWORK_ERROR'));
    socket.once('connect', () => socket.write(sslRequest()));
    socket.once('data', chunk => {
      const answer = String.fromCharCode(chunk[0]);
      if (answer !== 'S') { clearTimeout(timer); socket.destroy(); resolve({ sslAccepted: false, answer }); return; }
      const secure = tls.connect({ socket, servername: net.isIP(host) ? undefined : host, host, rejectUnauthorized: true, minVersion: 'TLSv1.2', ...tlsOptions });
      secure.once('error', fail('TLS_PROBE_HANDSHAKE_REJECTED'));
      secure.once('secureConnect', () => {
        clearTimeout(timer);
        const verified = secure.authorized === true;
        const result = { sslAccepted: true, certificateVerified: verified, hostnameVerified: verified,
          protocol: secure.getProtocol(), cipher: secure.getCipher()?.name || null };
        secure.end();
        resolve(result);
      });
    });
  });
}

/** Plaintext StartupMessage for a dummy user. Never answers an authentication request. */
function plaintextProbe(host, { database, endpoint }, { port = PORT, timeoutMs = TIMEOUT_MS } = {}) {
  return settleOnce((resolve, reject) => {
    const socket = net.connect({ host, port });
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('PLAINTEXT_PROBE_TIMEOUT')); }, timeoutMs);
    const finish = result => { clearTimeout(timer); socket.destroy(); resolve(result); };
    socket.once('error', error => finish({ plaintextRefused: true, how: 'connection-error', detail: error?.code || null }));
    socket.once('close', () => finish({ plaintextRefused: true, how: 'closed-without-response' }));
    socket.once('connect', () => socket.write(startupMessage({ user: 'tls_probe_no_password', database, options: `endpoint=${endpoint}` })));
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      const message = parseBackendMessage(buffer);
      if (!message) return;
      if (message.type === 'E') finish({ plaintextRefused: true, how: 'error-response', sqlstate: message.fields.C || null,
        mentionsTls: /ssl|tls|insecure|secure/i.test(message.fields.M || ''), message: (message.fields.M || '').slice(0, 200) });
      else finish({ plaintextRefused: false, how: `server-replied-${message.type}` });
    });
  });
}

/**
 * Client-side proof for the external leg. Throws (fail closed) unless the driver policy is strict, the endpoint
 * negotiates TLS ≥ 1.2 with a verified certificate for this host, and refuses plaintext.
 */
async function proveClientTls(target, { probe = tlsProbe, plaintext = plaintextProbe } = {}) {
  const driver = assertStrictTlsUrl(target.url);
  let handshake;
  try { handshake = await probe(target.host); } catch { throw new Error('TARGET_TLS_NOT_ACTIVE'); }
  if (handshake?.sslAccepted !== true) throw new Error('TARGET_TLS_NOT_ACTIVE');
  if (handshake.certificateVerified !== true || handshake.hostnameVerified !== true) throw new Error('TARGET_TLS_CERTIFICATE_UNVERIFIED');
  if (!['TLSv1.2', 'TLSv1.3'].includes(handshake.protocol)) throw new Error('TARGET_TLS_NOT_ACTIVE');
  let refusal;
  try { refusal = await plaintext(target.host, target); } catch { throw new Error('TARGET_PLAINTEXT_REFUSAL_UNPROVEN'); }
  if (refusal?.plaintextRefused !== true) throw new Error('TARGET_ACCEPTS_PLAINTEXT');
  return { driver, handshake: { protocol: handshake.protocol, cipher: handshake.cipher, certificateVerified: true, hostnameVerified: true },
    plaintextRefused: true, plaintextRefusal: refusal.sqlstate || refusal.how };
}

/** SQL fragment (scalar sub-selects) describing this session's transport as seen by Postgres. */
const SESSION_TRANSPORT_SQL = `(SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS server_side_ssl,
      (SELECT host(client_addr) FROM pg_stat_activity WHERE pid = pg_backend_pid()) AS server_side_peer`;

/**
 * Interprets the server-side view of this session. Never the only evidence: callers must run proveClientTls first.
 * ssl = false is accepted only from a private/loopback peer on a Neon server (the proxy→compute hop).
 */
function interpretSessionTransport({ ssl, peer, neonServer }) {
  const peerClass = addressClass(peer);
  if (ssl === true) return { serverSideSsl: true, peer: peerClass, interpretation: 'tls-terminated-at-postgres' };
  if (ssl === false && neonServer === true && ['private', 'loopback'].includes(peerClass)) {
    return { serverSideSsl: false, peer: peerClass, interpretation: 'neon-proxy-hop' };
  }
  throw new Error('TARGET_TLS_NOT_ACTIVE');
}

module.exports = { sslRequest, startupMessage, parseBackendMessage, addressClass, assertStrictTlsUrl, tlsProbe, plaintextProbe,
  proveClientTls, interpretSessionTransport, SESSION_TRANSPORT_SQL };
