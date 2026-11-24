// Offline contract test: the effective TLS behaviour of the INSTALLED Prisma engine (5.10) for the URL parameters
// scripts/neon-target.cjs relies on. Runs the real engine against fake endpoints on 127.0.0.1 (no database,
// no network beyond loopback). If a Prisma upgrade changes any of this, this test fails and the TLS policy in
// scripts/neon-tls.cjs must be re-evaluated.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { hasOpenssl, makeCertificates, fakePostgres } = require('./tls-lab.cjs');
const { parseRemoteTarget } = require('../scripts/neon-target.cjs');

async function connect(port, query) {
  const db = new PrismaClient({ datasources: { db: { url: `postgresql://lab:lab@127.0.0.1:${port}/lab?connect_timeout=5&${query}` } }, log: [] });
  let code = null;
  try { await db.$connect(); } catch (error) { code = error.errorCode || error.code || 'ERROR'; }
  await db.$disconnect().catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 100));
  return code;
}

async function scenario(options, query) {
  const server = await fakePostgres(options);
  try { const code = await connect(server.port, query); return { code, ...server.seen }; }
  finally { await server.close(); }
}

test('Prisma 5.10 TLS contract (sslmode / sslaccept)', { skip: !hasOpenssl() && 'openssl not available', timeout: 120000 }, async t => {
  const certs = makeCertificates();
  const ca = encodeURIComponent(certs.caFile);
  try {
    await t.test('sslmode=require never falls back to plaintext', async () => {
      const r = await scenario({ sslAnswer: 'N' }, 'sslmode=require');
      assert.equal(r.plaintextStartup, false); assert.equal(r.code, 'P1011');
    });
    await t.test('sslmode=require alone ACCEPTS a self-signed certificate (no verification)', async () => {
      const r = await scenario({ pair: certs.self }, 'sslmode=require');
      assert.equal(r.tlsStartup, true, 'client continued after an unverifiable certificate');
    });
    await t.test('sslaccept=strict rejects a self-signed certificate', async () => {
      const r = await scenario({ pair: certs.self }, 'sslmode=require&sslaccept=strict');
      assert.equal(r.tlsStartup, false); assert.equal(r.plaintextStartup, false); assert.equal(r.code, 'P1011');
    });
    await t.test('sslaccept=strict rejects a trusted chain for another host name', async () => {
      const r = await scenario({ pair: certs.wrong }, `sslmode=require&sslaccept=strict&sslcert=${ca}`);
      assert.equal(r.tlsStartup, false); assert.equal(r.code, 'P1011');
    });
    await t.test('sslaccept=strict accepts a trusted chain for the right host name (control)', async () => {
      const r = await scenario({ pair: certs.good }, `sslmode=require&sslaccept=strict&sslcert=${ca}`);
      assert.equal(r.tlsStartup, true);
    });
    await t.test('sslaccept=strict still never falls back to plaintext', async () => {
      const r = await scenario({ sslAnswer: 'N' }, 'sslmode=require&sslaccept=strict');
      assert.equal(r.plaintextStartup, false); assert.equal(r.code, 'P1011');
    });
    for (const mode of ['verify-full', 'verify-ca']) {
      await t.test(`sslmode=${mode} is NOT supported: plaintext fallback and no certificate check`, async () => {
        assert.equal((await scenario({ sslAnswer: 'N' }, `sslmode=${mode}`)).plaintextStartup, true);
        assert.equal((await scenario({ pair: certs.self }, `sslmode=${mode}`)).tlsStartup, true);
      });
    }
    await t.test('the URL produced by parseRemoteTarget rejects a self-signed certificate', async () => {
      const server = await fakePostgres({ pair: certs.self });
      try {
        const parsed = new URL(parseRemoteTarget('postgresql://lab:lab@ep-lab-1.example.invalid/lab?sslmode=require').url);
        assert.equal(await connect(server.port, `${parsed.searchParams.toString()}`), 'P1011');
        assert.equal(server.seen.tlsStartup, false);
      } finally { await server.close(); }
    });
  } finally { certs.cleanup(); }
});
