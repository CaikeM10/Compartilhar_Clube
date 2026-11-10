const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createStudent } = require('../scripts/local-auth-student.cjs');
const { loadTarget, verifyServer } = require('../scripts/auth-test-safety.cjs');
const { loadAuthFactory } = require('../scripts/local-auth-admin.cjs');
const identity = { database: 'compartilhar_auth_test', username: 'compartilhar_auth_test_user', host: '127.0.0.1', port: 5432 };

test('student creation refuses an unexpected SQL server before any write', async () => {
  await assert.rejects(createStudent({ $transaction: fn => fn({
    $queryRawUnsafe: async () => [{ ...identity, database: 'wrong' }],
  }) }, () => assert.fail('signup must not run')), /AUTH_TEST_SERVER_REJECTED/);
});

test('student creation never replaces an existing account or financial identity', async () => {
  for (const existingUser of [true, false]) {
    await assert.rejects(createStudent({ $transaction: fn => fn({
      $queryRawUnsafe: async () => [identity], $executeRawUnsafe: async () => 0,
      user: { findUnique: async () => existingUser ? { id: 'existing' } : null },
      payment: { count: async () => 1 },
    }) }, () => assert.fail('signup must not run'), 'synthetic@example.invalid', 'synthetic'),
    existingUser ? /EXISTING_ACCOUNT_REFUSED/ : /EXISTING_FINANCIAL_RECORD_REFUSED/);
  }
});

test('real local student: hashed password, subscription, denied admin, expiry and atomic rollback', async () => {
  const root = path.resolve(__dirname, '..');
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: loadTarget(root) } }, log: [] });
  let fixture, directory, before;
  const digest = async () => {
    const records = await Promise.all(['user', 'account', 'session', 'plan', 'subscription', 'payment', 'verification']
      .map(model => db[model].findMany({ orderBy: { id: 'asc' } })));
    return createHash('sha256').update(JSON.stringify(records)).digest('hex');
  };
  try {
    await verifyServer(db);
    before = await digest();
    const factory = await loadAuthFactory();
    const email = `student-fixture-${randomBytes(12).toString('hex')}@example.invalid`;
    const password = randomBytes(32).toString('base64url');
    fixture = await createStudent(db, factory, email, password);
    const user = await db.user.findUniqueOrThrow({ where: { id: fixture.userId } });
    assert.equal(user.role, 'STUDENT');
    assert.equal(user.emailVerified, false);
    assert.equal(user.password, null);
    const account = await db.account.findFirstOrThrow({ where: { userId: user.id, providerId: 'credential' } });
    assert.ok(account.password && account.password !== password);
    const plan = await db.plan.findUniqueOrThrow({ where: { id: fixture.planId } });
    assert.equal(plan.price, 0); assert.equal(plan.duration, 30);
    const subscription = await db.subscription.findUniqueOrThrow({ where: { id: fixture.subscriptionId } });
    assert.equal(subscription.endDate - subscription.startDate, 30 * 86400000);
    assert.equal(await db.payment.count({ where: { email } }), 0);
    const auth = factory(db, { secret: randomBytes(48).toString('base64url'), baseURL: 'http://127.0.0.1:3000', secureCookies: false });
    const login = await auth.handler(new Request('http://127.0.0.1:3000/api/auth/sign-in/email', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3000' },
      body: JSON.stringify({ email, password }),
    }));
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    directory = fs.mkdtempSync(path.join(root, 'node_modules/.cache/student-test-'));
    const file = path.join(directory, 'authorization.mjs');
    const source = fs.readFileSync(path.join(root, 'lib/auth/authorization-core.ts'), 'utf8');
    fs.writeFileSync(file, require('typescript').transpileModule(source.replace('import "server-only";', ''), {
      compilerOptions: { target: 9, module: 7 },
    }).outputText);
    const { createAuthorization } = await import(pathToFileURL(file).href);
    const access = createAuthorization(auth, db, async () => new Headers({ cookie }));
    assert.equal((await access.requireActiveSubscription()).user.id, user.id);
    await assert.rejects(access.requireAdmin(), error => error.status === 403);
    await db.subscription.update({ where: { id: fixture.subscriptionId }, data: { endDate: new Date(Date.now() - 1000) } });
    await assert.rejects(access.requireActiveSubscription(), error => error.code === 'SUBSCRIPTION_REQUIRED');
    assert.equal((await access.requireSession()).user.id, user.id);
    await assert.rejects(createStudent(db, factory, email, password), /EXISTING_ACCOUNT_REFUSED/);
    const rollbackEmail = `rollback-${randomBytes(12).toString('hex')}@example.invalid`;
    const failAfterSignup = (tx, env) => {
      const real = factory(tx, env);
      return { api: { signUpEmail: async args => { await real.api.signUpEmail(args); throw new Error('TEST_ROLLBACK'); } } };
    };
    await assert.rejects(createStudent(db, failAfterSignup, rollbackEmail, password), /TEST_ROLLBACK/);
    assert.equal(await db.user.count({ where: { email: rollbackEmail } }), 0);
  } catch { throw new Error('LOCAL_STUDENT_TEST_FAILED_REDACTED'); }
  finally {
    try {
      if (fixture) {
        await db.$transaction(async tx => {
          await verifyServer(tx);
          await tx.subscription.delete({ where: { id: fixture.subscriptionId } });
          await tx.session.deleteMany({ where: { userId: fixture.userId } });
          await tx.account.deleteMany({ where: { userId: fixture.userId } });
          await tx.user.delete({ where: { id: fixture.userId } });
          await tx.plan.delete({ where: { id: fixture.planId } });
        });
      }
      if (before) assert.equal(await digest(), before, 'Existing database records must be preserved');
    } finally {
      await db.$disconnect();
      if (directory) { fs.unlinkSync(path.join(directory, 'authorization.mjs')); fs.rmdirSync(directory); }
    }
  }
});
