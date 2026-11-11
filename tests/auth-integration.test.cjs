const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { validateTarget, verifyServer } = require('../scripts/auth-test-safety.cjs');

test('Better Auth 1.7.17 + Prisma 5.10.2 + local PostgreSQL', async t => {
  const url = validateTarget(process.env.TEST_DATABASE_URL);
  const { PrismaClient, Prisma } = require(process.env.AUTH_TEST_CLIENT);
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  const ids = [];
  let verified = false;
  let auth;
  // Redact arbitrary library exceptions, including assertion values containing tokens/hashes.
  const scenario = (name, fn) => t.test(name, async () => {
    try { await fn(); } catch (error) {
      throw new Error(`Scenario failed: ${name}; code=${/^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'REDACTED'}`);
    }
  });
  try {
    await verifyServer(db);
    verified = true;
    const { betterAuth } = await import('better-auth');
    const { prismaAdapter } = await import('better-auth/adapters/prisma');
    const { verifyPassword, hashPassword } = await import('better-auth/crypto');
    auth = betterAuth({
      database: prismaAdapter(db, { provider: 'postgresql' }),
      secret: randomBytes(48).toString('base64url'),
      baseURL: 'http://127.0.0.1:3000',
      emailAndPassword: { enabled: true },
      user: { additionalFields: { role: { type: 'string', required: false, defaultValue: 'STUDENT', input: false } } },
      session: { cookieCache: { enabled: false } },
      rateLimit: { enabled: false },
      logger: { disabled: true },
    });
    const request = async (endpoint, body, cookie) => {
      const response = await auth.handler(new Request(`http://127.0.0.1:3000/api/auth/${endpoint}`, {
        method: body ? 'POST' : 'GET',
        headers: { origin: 'http://127.0.0.1:3000', ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }));
      const data = await response.json();
      const cookies = response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
      return { status: response.status, data, cookie: cookies };
    };
    const password = 'Synthetic-test-only-982!';
    const email = 'auth-homologation@example.invalid';
    let signup, login;
    await scenario('installed versions are exactly the requested versions', async () => {
      const fs = require('node:fs');
      const path = require('node:path');
      assert.equal(JSON.parse(fs.readFileSync(path.resolve(path.dirname(require.resolve('better-auth')), '../package.json'), 'utf8')).version, '1.7.17');
      assert.equal(Prisma.prismaVersion.client, '5.10.2');
    });
    await scenario('real sign-up persists user and password hash in Account only', async () => {
      signup = await request('sign-up/email', { name: 'Synthetic Student', email, password });
      assert.equal(signup.status, 200);
      ids.push(signup.data.user.id);
      const user = await db.user.findUniqueOrThrow({ where: { email }, include: { accounts: true } });
      assert.equal(user.name, 'Synthetic Student');
      assert.equal(user.password, null);
      assert.equal(user.accounts.length, 1);
      assert.equal(user.accounts[0].providerId, 'credential');
      assert.ok(user.accounts[0].password && user.accounts[0].password !== password);
      assert.equal(await verifyPassword({ hash: user.accounts[0].password, password }), true);
    });
    await scenario('real sign-in creates persisted session readable with signed cookie', async () => {
      login = await request('sign-in/email', { email, password });
      assert.equal(login.status, 200);
      assert.ok(login.cookie);
      const session = await request('get-session', undefined, login.cookie);
      assert.equal(session.data.user.id, signup.data.user.id);
      const stored = await db.session.findUniqueOrThrow({ where: { token: session.data.session.token } });
      assert.equal(stored.userId, signup.data.user.id);
      assert.ok(stored.expiresAt > new Date());
    });
    await scenario('invalid password and unknown email are rejected', async () => {
      const count = await db.session.count();
      for (const body of [{ email, password: 'Incorrect-password!' }, { email: 'missing@example.invalid', password }]) {
        assert.equal((await request('sign-in/email', body)).status, 401);
      }
      assert.equal(await db.session.count(), count);
    });
    await scenario('expired database session is rejected by real get-session', async () => {
      await db.session.update({ where: { token: login.data.token }, data: { expiresAt: new Date(Date.now() - 60_000) } });
      assert.equal((await request('get-session', undefined, login.cookie)).data, null);
    });
    await scenario('real revoke-session invalidates another session', async () => {
      const first = await request('sign-in/email', { email, password });
      const second = await request('sign-in/email', { email, password });
      assert.equal((await request('revoke-session', { token: second.data.token }, first.cookie)).status, 200);
      assert.equal(await db.session.findUnique({ where: { token: second.data.token } }), null);
      assert.equal((await request('get-session', undefined, second.cookie)).data, null);
      assert.ok((await request('get-session', undefined, first.cookie)).data);
      assert.equal((await request('sign-out', {}, first.cookie)).status, 200);
      assert.equal((await request('get-session', undefined, first.cookie)).data, null);
    });
    await scenario('signup and authenticated update cannot assign ADMIN or emailVerified', async () => {
      const attackEmail = 'tampering@example.invalid';
      const attack = await request('sign-up/email', { email: attackEmail, password, name: 'Synthetic', role: 'ADMIN', emailVerified: true });
      assert.equal(attack.status, 200);
      ids.push(attack.data.user.id);
      let user = await db.user.findUniqueOrThrow({ where: { email: attackEmail } });
      assert.equal(user.role, 'STUDENT');
      assert.equal(user.emailVerified, false);
      const update = await request('update-user', { name: 'Updated Synthetic', role: 'ADMIN', emailVerified: true }, attack.cookie);
      assert.ok([200, 400].includes(update.status));
      user = await db.user.findUniqueOrThrow({ where: { email: attackEmail } });
      assert.equal(user.role, 'STUDENT');
      assert.equal(user.emailVerified, false);
      assert.equal(await db.user.count({ where: { role: 'ADMIN' } }), 0);
    });
    await scenario('historical nullable user rejects login without credential and preserves ID on duplicate signup', async () => {
      const historical = await db.user.create({ data: { id: 'historical-synthetic-fixed-id', email: 'historical@example.invalid', name: null, password: null } });
      ids.push(historical.id);
      assert.equal((await request('sign-in/email', { email: historical.email, password })).status, 401);
      const duplicate = await request('sign-up/email', { email: historical.email, password, name: 'Replacement' });
      assert.ok(duplicate.status >= 400 && duplicate.status < 500);
      const stored = await db.user.findUniqueOrThrow({ where: { email: historical.email } });
      assert.equal(stored.id, historical.id);
      assert.equal(stored.name, null);
      assert.equal(stored.password, null);
      assert.equal(await db.account.count({ where: { userId: historical.id } }), 0);
    });
    await scenario('historical user with synthetic credential can authenticate with null name and unchanged ID', async () => {
      const id = 'historical-synthetic-fixed-id';
      // Fixture only: this is not a password migration or an account recovery implementation.
      await db.account.create({ data: { userId: id, accountId: id, providerId: 'credential', password: await hashPassword(password) } });
      const signed = await request('sign-in/email', { email: 'historical@example.invalid', password });
      assert.equal(signed.status, 200);
      assert.equal(signed.data.user.id, id);
      assert.equal(signed.data.user.name, null);
      const session = await request('get-session', undefined, signed.cookie);
      assert.equal(session.data.user.id, id);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id } })).password, null);
    });
    await scenario('Account and Session independently enforce onDelete Restrict', async () => {
      for (const relation of ['account', 'session']) {
        const user = await db.user.create({ data: { email: `${relation}-restrict@example.invalid` } });
        ids.push(user.id);
        if (relation === 'account') await db.account.create({ data: { userId: user.id, accountId: user.id, providerId: 'credential' } });
        else await db.session.create({ data: { userId: user.id, token: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 60_000) } });
        let deletionError;
        try { await db.user.delete({ where: { id: user.id } }); } catch (error) { deletionError = error; }
        assert.ok(deletionError, 'Deletion must be rejected');
        // PostgreSQL 18 reports restrict_violation (23001). Prisma 5.10.2 does
        // not map this to P2003; assert the precise observed error, not any failure.
        assert.equal(deletionError.name, 'PrismaClientUnknownRequestError');
        assert.match(deletionError.message, /code: "23001"/);
        assert.ok(deletionError.message.includes(`auth_${relation === 'account' ? 'accounts' : 'sessions'}_userId_fkey`));
        console.log(`Confirmed ${relation} Restrict: SQLSTATE 23001, PrismaClientUnknownRequestError`);
        assert.ok(await db.user.findUnique({ where: { id: user.id } }));
        await db[relation].deleteMany({ where: { userId: user.id } });
        await db.user.delete({ where: { id: user.id } });
      }
    });
  } catch {
    throw new Error('AUTH_TEST_SETUP_OR_EXECUTION_FAILED_REDACTED');
  } finally {
    // Only IDs created by this test; do not truncate or delete unrelated data.
    try {
      if (verified && ids.length) {
        await db.session.deleteMany({ where: { userId: { in: ids } } });
        await db.account.deleteMany({ where: { userId: { in: ids } } });
        await db.user.deleteMany({ where: { id: { in: ids } } });
      }
    } catch { throw new Error('AUTH_TEST_CLEANUP_FAILED_REDACTED'); }
    finally { await db.$disconnect(); }
  }
});
