// Offline TLS lab shared by tests (not a test file): throwaway certificates generated with openssl in a temporary
// directory (never versioned) and a fake Postgres endpoint on 127.0.0.1 that records what a client sent.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const tls = require('node:tls');
const { execFileSync } = require('node:child_process');

function hasOpenssl() {
  try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

/** self: self-signed for 127.0.0.1; good: CA-signed for 127.0.0.1; wrong: CA-signed for other.example. */
function makeCertificates() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tls-lab-'));
  const run = args => execFileSync('openssl', args, { cwd: dir, stdio: 'ignore' });
  run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'self.key', '-out', 'self.crt', '-days', '2', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1']);
  run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '2', '-subj', '/CN=tls-lab-ca',
    '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
  for (const [name, san] of [['good', 'IP:127.0.0.1'], ['wrong', 'DNS:other.example']]) {
    run(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', `/CN=${name}`]);
    fs.writeFileSync(path.join(dir, `${name}.ext`), `subjectAltName=${san}\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n`);
    run(['x509', '-req', '-in', `${name}.csr`, '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', `${name}.crt`, '-days', '2', '-extfile', `${name}.ext`]);
  }
  const file = name => path.join(dir, name);
  const pair = name => ({ key: fs.readFileSync(file(`${name}.key`)), cert: fs.readFileSync(file(`${name}.crt`)) });
  return { dir, caFile: file('ca.crt'), ca: fs.readFileSync(file('ca.crt')), self: pair('self'), good: pair('good'), wrong: pair('wrong'),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const isStartup = chunk => chunk.length >= 8 && chunk.readInt32BE(4) === 196608;
const isSslRequest = chunk => chunk.length >= 8 && chunk.readInt32BE(4) === 80877103;

/**
 * Fake endpoint. sslAnswer 'S' upgrades to TLS with `pair`; 'N' refuses SSL. Records whether a StartupMessage
 * arrived in plaintext or inside TLS (i.e. whether the client accepted the certificate), then closes.
 */
function fakePostgres({ sslAnswer = 'S', pair } = {}) {
  const seen = { sslRequest: false, plaintextStartup: false, tlsStartup: false };
  const server = net.createServer(socket => {
    socket.on('error', () => {});
    socket.once('data', chunk => {
      if (isStartup(chunk)) { seen.plaintextStartup = true; socket.destroy(); return; }
      if (!isSslRequest(chunk)) { socket.destroy(); return; }
      seen.sslRequest = true;
      socket.write(sslAnswer);
      if (sslAnswer !== 'S') { socket.once('data', next => { if (isStartup(next)) seen.plaintextStartup = true; socket.destroy(); }); return; }
      const secure = new tls.TLSSocket(socket, { isServer: true, ...pair });
      secure.on('error', () => {});
      secure.once('data', next => { if (isStartup(next)) seen.tlsStartup = true; secure.destroy(); });
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
    port: server.address().port, seen, close: () => new Promise(done => server.close(() => done())),
  })));
}

module.exports = { hasOpenssl, makeCertificates, fakePostgres };
