const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAdmin, removeAdmin, isolatedEnvironment, loadAuthFactory } = require('../scripts/local-auth-admin.cjs');
const identity = { database: 'compartilhar_auth_test', username: 'compartilhar_auth_test_user', host: '127.0.0.1', port: 5432 };
const target = 'postgresql://compartilhar_auth_test_user:synthetic@127.0.0.1:5432/compartilhar_auth_test';

test('manual launcher isolates inherited secrets and fixes the local origin', () => {
  process.env.LOCAL_ADMIN_TEST_UNTRUSTED = 'must-not-inherit';
  try {
    const env = isolatedEnvironment(target);
    assert.equal(env.LOCAL_ADMIN_TEST_UNTRUSTED, undefined);
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.equal(env.BETTER_AUTH_URL, 'http://127.0.0.1:3000');
    assert.equal(env.DATABASE_URL, target);
    assert.equal(env.TEST_DATABASE_URL, env.DATABASE_URL);
    assert.ok(env.BETTER_AUTH_SECRET.length >= 32);
    assert.notEqual(env.BETTER_AUTH_SECRET, isolatedEnvironment(target).BETTER_AUTH_SECRET);
  } finally { delete process.env.LOCAL_ADMIN_TEST_UNTRUSTED; }
});

test('pnpm dev uses the isolated launcher; remote databases cannot enter its environment', () => {
  assert.equal(require('../package.json').scripts.dev, 'node scripts/local-auth-admin.cjs dev');
  assert.throws(() => isolatedEnvironment(target.replace('127.0.0.1', 'remote.invalid')), /AUTH_TEST_TARGET_REJECTED/);
});

test('the exact server environment validator accepts the launcher environment', async () => {
  const { readAuthEnvironment } = await require('../scripts/local-auth-admin.cjs').loadAuthConfiguration();
  assert.throws(() => readAuthEnvironment({}), /AUTH_SECRET_REQUIRED_MIN_32_CHARACTERS/);
  const environment = readAuthEnvironment(isolatedEnvironment(target));
  assert.equal(environment.baseURL, 'http://127.0.0.1:3000');
  assert.equal(environment.secureCookies, false);
});

test('create refuses a mismatched SQL server before signup or writes', async () => {
  const db = { $transaction: fn => fn({ $queryRawUnsafe: async () => [{ ...identity, database: 'other' }] }) };
  await assert.rejects(createAdmin(db, () => assert.fail('must not invoke signup')), /AUTH_TEST_SERVER_REJECTED/);
});

test('create refuses an existing administrator before invoking Better Auth', async () => {
  const db = { $transaction: fn => fn({ $queryRawUnsafe: async () => [identity],
    $executeRawUnsafe: async () => 0, user: { count: async () => 1 } }) };
  await assert.rejects(createAdmin(db, () => assert.fail('must not invoke signup')), /LOCAL_ADMIN_ALREADY_EXISTS/);
});

test('removal refuses financial links without deleting any record', async () => {
  const record = { id: 'test-id', email: 'not-an-account.invalid' };
  const db = { $transaction: fn => fn({ $queryRawUnsafe: async () => [identity],
    user: { findUnique: async () => ({ ...record, role: 'ADMIN' }) },
    subscription: { count: async () => 1 } }) };
  await assert.rejects(removeAdmin(db, record), /FINANCIAL_LINKS_REFUSE_DELETE/);
});

test('operational command loads the existing Better Auth configuration', async () => {
  assert.equal(typeof await loadAuthFactory(), 'function');
});
