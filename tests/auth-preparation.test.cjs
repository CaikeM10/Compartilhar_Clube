const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const before = read('docs/auth-preparation/before.prisma');
const after = read('prisma/schema.prisma');
const sql = read('docs/auth-preparation/proposed.sql');
const model = (source, name) => source.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`))[1];

test('financial models are unchanged', () => {
  for (const name of ['Plan', 'Subscription', 'Payment']) {
    assert.equal(model(after, name), model(before, name));
  }
});

test('every legacy User declaration remains, including nullable password and name', () => {
  const current = model(after, 'User').split('\n').map(line => line.trim());
  for (const line of model(before, 'User').split('\n').map(line => line.trim()).filter(Boolean)) {
    assert.ok(current.includes(line), `Legacy declaration changed: ${line}`);
  }
  assert.match(after, /role\s+Role\s+@default\(STUDENT\)/);
  assert.match(after, /emailVerified\s+Boolean\s+@default\(false\)/);
});

test('SQL adds auth structures without destructive or financial data statements', () => {
  const statements = sql.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
  for (const statement of statements) {
    assert.match(statement, /^(CREATE TYPE "Role"|CREATE TABLE "auth_|CREATE (UNIQUE )?INDEX "auth_|ALTER TABLE "(users|auth_accounts|auth_sessions)")/);
    assert.doesNotMatch(statement, /\b(DROP|TRUNCATE|DELETE FROM|INSERT INTO|UPDATE "|RENAME)\b/i);
  }
  assert.match(sql, /"role" "Role" NOT NULL DEFAULT 'STUDENT'/);
  assert.match(sql, /"emailVerified" BOOLEAN NOT NULL DEFAULT false/);
  assert.equal((sql.match(/ON DELETE RESTRICT/g) || []).length, 2);
  assert.match(sql, /UNIQUE INDEX "auth_sessions_token_key"/);
  assert.match(sql, /UNIQUE INDEX "auth_accounts_providerId_accountId_key"/);
});
