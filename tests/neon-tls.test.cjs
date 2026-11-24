// Offline: client-side TLS proof for Neon targets (scripts/neon-tls.cjs). Fake endpoints on 127.0.0.1 only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const tlsProof = require('../scripts/neon-tls.cjs');
const { hasOpenssl, makeCertificates, fakePostgres } = require('./tls-lab.cjs');

const strictUrl = 'postgresql://u:SECRET@ep-ensaio-1.sa-east-1.aws.neon.tech/neondb?sslmode=require&sslaccept=strict';
const target = { url: strictUrl, host: 'ep-ensaio-1.sa-east-1.aws.neon.tech', endpoint: 'ep-ensaio-1', database: 'neondb' };
const verified = { sslAccepted: true, certificateVerified: true, hostnameVerified: true, protocol: 'TLSv1.3', cipher: 'TLS_AES_256_GCM_SHA384' };
const refused = { plaintextRefused: true, how: 'error-response', sqlstate: '08P01' };

function rawServer(onFirstChunk) {
  return new Promise(resolve => {
    const received = [];
    const server = net.createServer(socket => {
      socket.on('error', () => {});
      socket.on('data', chunk => { received.push(chunk); if (received.length === 1) onFirstChunk(socket, chunk); });
    });
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, received, close: () => server.close() }));
  });
}
function errorResponse(fields) {
  const body = Buffer.concat([...Object.entries(fields).map(([k, v]) => Buffer.from(`${k}${v}\0`)), Buffer.from('\0')]);
  const header = Buffer.alloc(5); header.write('E', 0); header.writeInt32BE(4 + body.length, 1);
  return Buffer.concat([header, body]);
}

test('protocol messages: SSLRequest is 8 bytes, StartupMessage carries no password parameter', () => {
  assert.deepEqual([...tlsProof.sslRequest()], [0, 0, 0, 8, 4, 210, 22, 47]);
  const startup = tlsProof.startupMessage({ user: 'tls_probe_no_password', database: 'neondb', options: 'endpoint=ep-x' });
  assert.equal(startup.readInt32BE(0), startup.length);
  assert.equal(startup.readInt32BE(4), 196608);
  const keys = startup.subarray(8).toString('utf8').split('\0').filter((_, index) => index % 2 === 0).filter(Boolean);
  assert.deepEqual(keys, ['user', 'database', 'options']);
  const message = errorResponse({ S: 'ERROR', C: '08P01', M: 'connection is insecure (try using sslmode=require)' });
  assert.equal(tlsProof.parseBackendMessage(message.subarray(0, 6)), null);
  assert.equal(tlsProof.parseBackendMessage(message).fields.C, '08P01');
});

test('address classes: private, CGNAT and loopback peers are distinguished from public ones', () => {
  for (const ip of ['10.1.2.3', '::ffff:192.168.0.4', '172.20.0.1', '100.64.1.1', 'fd12:3456::1']) assert.equal(tlsProof.addressClass(ip), 'private', ip);
  assert.equal(tlsProof.addressClass('127.0.0.1'), 'loopback');
  for (const ip of ['8.8.8.8', '172.32.0.1', '100.128.0.1']) assert.equal(tlsProof.addressClass(ip), 'public', ip);
  assert.equal(tlsProof.addressClass(null), 'none');
});

test('driver policy: only sslmode=require with sslaccept=strict and the system trust store', () => {
  assert.deepEqual(tlsProof.assertStrictTlsUrl(`${strictUrl}&channel_binding=require`), { sslmode: 'require', sslaccept: 'strict' });
  for (const query of ['sslmode=require', 'sslmode=require&sslaccept=accept_invalid_certs', 'sslmode=verify-full&sslaccept=strict',
    'sslmode=verify-ca&sslaccept=strict', 'sslmode=prefer&sslaccept=strict', 'sslmode=require&sslmode=disable&sslaccept=strict',
    'sslmode=require&sslaccept=strict&sslaccept=accept_invalid_certs', 'sslmode=require&sslaccept=strict&sslcert=ca.pem', '']) {
    assert.throws(() => tlsProof.assertStrictTlsUrl(`postgresql://u@ep-x.neon.tech/neondb?${query}`), /TARGET_TLS_DRIVER_NOT_STRICT/, query);
  }
  assert.throws(() => tlsProof.assertStrictTlsUrl('not a url'), /TARGET_TLS_DRIVER_NOT_STRICT/);
});

test('proveClientTls: verified handshake + plaintext refusal → evidence without secrets', async () => {
  const evidence = await tlsProof.proveClientTls(target, { probe: async () => verified, plaintext: async () => refused });
  assert.deepEqual(evidence, { driver: { sslmode: 'require', sslaccept: 'strict' },
    handshake: { protocol: 'TLSv1.3', cipher: 'TLS_AES_256_GCM_SHA384', certificateVerified: true, hostnameVerified: true },
    plaintextRefused: true, plaintextRefusal: '08P01' });
  assert.ok(!JSON.stringify(evidence).includes('SECRET'));
});

test('proveClientTls fails closed on every unproven case', async () => {
  const cases = [
    [{ ...target, url: target.url.replace('&sslaccept=strict', '') }, {}, /TARGET_TLS_DRIVER_NOT_STRICT/],
    [target, { probe: async () => { throw new Error('TLS_PROBE_TIMEOUT'); } }, /TARGET_TLS_NOT_ACTIVE/],
    [target, { probe: async () => ({ sslAccepted: false, answer: 'N' }) }, /TARGET_TLS_NOT_ACTIVE/],
    [target, { probe: async () => ({ ...verified, certificateVerified: false }) }, /TARGET_TLS_CERTIFICATE_UNVERIFIED/],
    [target, { probe: async () => ({ ...verified, hostnameVerified: undefined }) }, /TARGET_TLS_CERTIFICATE_UNVERIFIED/],
    [target, { probe: async () => ({ ...verified, protocol: 'TLSv1.1' }) }, /TARGET_TLS_NOT_ACTIVE/],
    [target, { plaintext: async () => ({ plaintextRefused: false, how: 'server-replied-R' }) }, /TARGET_ACCEPTS_PLAINTEXT/],
    [target, { plaintext: async () => { throw new Error('PLAINTEXT_PROBE_TIMEOUT'); } }, /TARGET_PLAINTEXT_REFUSAL_UNPROVEN/],
    [target, { probe: async () => null }, /TARGET_TLS_NOT_ACTIVE/],
  ];
  for (const [t, overrides, error] of cases) {
    await assert.rejects(tlsProof.proveClientTls(t, { probe: async () => verified, plaintext: async () => refused, ...overrides }), error);
  }
});

test('Neon proxy regression: pg_stat_ssl = false is accepted only as the proxy hop (private peer, Neon server)', () => {
  assert.deepEqual(tlsProof.interpretSessionTransport({ ssl: false, peer: '10.12.0.7', neonServer: true }),
    { serverSideSsl: false, peer: 'private', interpretation: 'neon-proxy-hop' });
  assert.deepEqual(tlsProof.interpretSessionTransport({ ssl: true, peer: '203.0.113.9', neonServer: true }),
    { serverSideSsl: true, peer: 'public', interpretation: 'tls-terminated-at-postgres' });
  for (const view of [{ ssl: false, peer: '203.0.113.9', neonServer: true }, { ssl: false, peer: '10.0.0.1', neonServer: false },
    { ssl: false, peer: null, neonServer: true }, { ssl: null, peer: '10.0.0.1', neonServer: true }, { ssl: undefined, peer: undefined, neonServer: true }]) {
    assert.throws(() => tlsProof.interpretSessionTransport(view), /TARGET_TLS_NOT_ACTIVE/, JSON.stringify(view));
  }
  assert.match(tlsProof.SESSION_TRANSPORT_SQL, /pg_stat_ssl WHERE pid = pg_backend_pid\(\)/);
  assert.match(tlsProof.SESSION_TRANSPORT_SQL, /pg_stat_activity WHERE pid = pg_backend_pid\(\)/);
});

test('tlsProbe: server refusing SSL is reported, and only the 8-byte SSLRequest is sent', async () => {
  const server = await rawServer(socket => socket.end('N'));
  try {
    assert.deepEqual(await tlsProof.tlsProbe('127.0.0.1', { port: server.port, timeoutMs: 3000 }), { sslAccepted: false, answer: 'N' });
    assert.deepEqual([...Buffer.concat(server.received)], [...tlsProof.sslRequest()]);
  } finally { server.close(); }
});

test('tlsProbe: garbage after S fails closed', async () => {
  const server = await rawServer(socket => { socket.write('S'); socket.write('not tls'); socket.end(); });
  try { await assert.rejects(tlsProof.tlsProbe('127.0.0.1', { port: server.port, timeoutMs: 3000 }), /TLS_PROBE_HANDSHAKE_REJECTED/); }
  finally { server.close(); }
});

test('tlsProbe verifies chain and host name for real (openssl lab certificates)', { skip: !hasOpenssl() && 'openssl not available' }, async () => {
  const certs = makeCertificates();
  try {
    const good = await fakePostgres({ pair: certs.good });
    try {
      const result = await tlsProof.tlsProbe('127.0.0.1', { port: good.port, timeoutMs: 5000, tlsOptions: { ca: certs.ca } });
      assert.equal(result.sslAccepted, true); assert.equal(result.certificateVerified, true); assert.match(result.protocol, /^TLSv1\.[23]$/);
      assert.equal(good.seen.tlsStartup, false, 'the probe never sends a StartupMessage');
    } finally { await good.close(); }
    for (const [pair, tlsOptions, label] of [[certs.self, {}, 'self-signed'], [certs.wrong, { ca: certs.ca }, 'host-name mismatch'], [certs.good, {}, 'untrusted CA']]) {
      const server = await fakePostgres({ pair });
      try { await assert.rejects(tlsProof.tlsProbe('127.0.0.1', { port: server.port, timeoutMs: 5000, tlsOptions }), /TLS_PROBE_HANDSHAKE_REJECTED/, label); }
      finally { await server.close(); }
    }
  } finally { certs.cleanup(); }
});

test('plaintextProbe: refusal detected; an authentication request is never answered', async () => {
  const refuse = await rawServer(socket => socket.end(errorResponse({ S: 'ERROR', C: '08P01', M: 'connection is insecure' })));
  try {
    const result = await tlsProof.plaintextProbe('127.0.0.1', { database: 'neondb', endpoint: 'ep-x' }, { port: refuse.port, timeoutMs: 3000 });
    assert.equal(result.plaintextRefused, true); assert.equal(result.sqlstate, '08P01'); assert.equal(result.mentionsTls, true);
  } finally { refuse.close(); }
  const accept = await rawServer(socket => socket.write(Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 3]))); // AuthenticationCleartextPassword
  try {
    const result = await tlsProof.plaintextProbe('127.0.0.1', { database: 'neondb', endpoint: 'ep-x' }, { port: accept.port, timeoutMs: 3000 });
    assert.deepEqual(result, { plaintextRefused: false, how: 'server-replied-R' });
    assert.equal(accept.received.length, 1, 'only the StartupMessage is sent');
  } finally { accept.close(); }
});
