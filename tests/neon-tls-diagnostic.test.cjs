// Offline: read-only TLS diagnostic (scripts/neon-tls-diagnostic.cjs). Probes are covered in tests/neon-tls.test.cjs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const diag = require('../scripts/neon-tls-diagnostic.cjs');

test('session view runs in a READ ONLY transaction against pg_backend_pid() and hides the peer address', async () => {
  const calls = [];
  const tx = {
    $executeRawUnsafe: async sql => { calls.push(sql); },
    $queryRawUnsafe: async sql => { calls.push(sql); return [{ database: 'neondb', ssl: false, tls_version: null, cipher: null, client_addr: '10.0.0.5', backend_type: 'client backend', replica: false, neon_settings: 9 }]; },
  };
  const view = await diag.sessionView({ $transaction: fn => fn(tx) });
  assert.equal(calls[0], 'SET TRANSACTION READ ONLY');
  assert.match(calls[1], /pg_backend_pid\(\)/);
  assert.doesNotMatch(calls.join(' '), /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i);
  assert.equal(view.serverSideSsl, false); assert.equal(view.peerAddressClass, 'private');
  assert.ok(!JSON.stringify(view).includes('10.0.0.5'));
});

test('verdict requires verified client TLS and plaintext refusal before blaming the check', () => {
  const probe = { sslAccepted: true, certificateVerified: true };
  const plaintext = { plaintextRefused: true };
  const session = { serverSideSsl: false, peerAddressClass: 'private' };
  assert.equal(diag.verdict({ probe, plaintext, session }), 'CHECK_MEASURES_PROXY_HOP_CONNECTION_IS_TLS');
  assert.equal(diag.verdict({ probe: { sslAccepted: false }, plaintext, session }), 'CLIENT_TLS_NOT_PROVEN');
  assert.equal(diag.verdict({ probe: { error: 'X' }, plaintext, session }), 'CLIENT_TLS_NOT_PROVEN');
  assert.equal(diag.verdict({ probe, plaintext: { plaintextRefused: false }, session }), 'ENDPOINT_ACCEPTS_PLAINTEXT');
  assert.equal(diag.verdict({ probe, plaintext, session: { error: 'P1011' } }), 'INCONCLUSIVE');
});
