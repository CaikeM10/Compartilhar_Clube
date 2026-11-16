// No database: guard rails of the Neon rehearsal smoke test.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertRehearsalBranch, smoke } = require('../scripts/neon-branch-smoke.cjs');

test('refuses production-like branch names', () => {
  for (const name of ['production', 'Production', ' main ', 'prod', 'master', '']) {
    assert.throws(() => assertRehearsalBranch(name), /REHEARSAL_BRANCH_REQUIRED/);
  }
  assert.equal(assertRehearsalBranch('ensaio-better-auth'), 'ensaio-better-auth');
});

test('refuses a database that is not migrated before any Better Auth call', async () => {
  const tx = {
    $queryRawUnsafe: async sql => /current_database/.test(sql) ? [{ database: 'neondb' }]
      : /information_schema.tables/.test(sql) ? [{ table_name: 'users' }] : [{ column_name: 'id' }],
  };
  const db = { $transaction: fn => fn(tx), user: { count: async () => 0 } };
  await assert.rejects(smoke(db, () => assert.fail('must not build auth'), { database: 'neondb' }), /AUTH_SCHEMA_NOT_MIGRATED/);
});
