const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateTarget } = require('../scripts/auth-test-safety.cjs');
const valid = 'postgresql://compartilhar_auth_test_user:synthetic@127.0.0.1:5432/compartilhar_auth_test';
test('accepts only the authorized explicit local target', () => {
  assert.equal(validateTarget(valid), valid);
  assert.equal(validateTarget(valid + '?schema=public'), valid + '?schema=public');
});
test('rejects wrong host, port, database, user, missing input and connection overrides', () => {
  for (const value of [undefined, '', valid.replace('127.0.0.1', 'localhost'), valid.replace('127.0.0.1', 'remote.invalid'),
    valid.replace('5432', '5433'), valid.replace('/compartilhar_auth_test', '/production'),
    valid.replace('_user:', '_admin:'), valid + '?host=remote.invalid', valid + '?schema=private', valid + '#fragment']) {
    assert.throws(() => validateTarget(value), /AUTH_TEST_TARGET_REJECTED/);
  }
});
