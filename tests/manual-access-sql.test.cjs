// Static checks of the manual access migration files (never executed by tests, never connected to any database).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readManualAccessProposal, stripManualAccessSchema } = require('./manual-access-schema.cjs');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const proposal = read('prisma/proposals/manual-access.sql');
const apply = read('docs/producao-migracao/08-manual-access.sql');
const verify = read('docs/producao-migracao/09-manual-access-verificacao-somente-leitura.sql');
const revert = read('docs/producao-migracao/93-manual-access-reversao.sql');
const withoutComments = sql => sql.replace(/--.*$/gm, '');

test('08 wraps the reviewed proposal verbatim inside one transaction, requires 06 and checks that nothing else changed', () => {
  const open = '-- >>> prisma/proposals/manual-access.sql\n';
  const start = apply.indexOf(open);
  const end = apply.indexOf('-- <<< prisma/proposals/manual-access.sql');
  assert.ok(start > 0 && end > start);
  assert.equal(apply.slice(start + open.length, end), proposal);
  assert.match(apply, /^BEGIN;$/m); assert.match(apply, /^COMMIT;$/m);
  assert.match(apply, /PRECONDITION: gerenciamento de usuários \(06\) ausente/);
  assert.match(apply, /PRECONDITION: 08 já aplicado/);
  assert.match(apply, /POSTCONDITION: contagens de usuários, credenciais ou sessões mudaram/);
  assert.match(apply, /POSTCONDITION: contagens financeiras mudaram/);
  for (const table of ['plans', 'subscriptions', 'payments']) assert.match(apply, new RegExp(`count\\(\\*\\) FROM "${table}"`));
});

test('the proposal is additive and financially inert: no existing table altered, no row written, nothing dropped', () => {
  const sql = withoutComments(proposal);
  assert.doesNotMatch(sql, /\bDROP\b|\bALTER\s+TABLE\b|\bTRUNCATE\s+(TABLE\s+)?"|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+"\w+"\s+SET\b/i);
  assert.doesNotMatch(sql, /"(plans|subscriptions|payments|admin_audit_events)"/, 'never references the financial or admin audit tables');
  assert.deepEqual([...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map(m => m[1]), ['manual_access_grants', 'manual_access_events']);
  assert.match(sql, /CREATE UNIQUE INDEX "manual_access_grants_userId_key" ON "manual_access_grants"\("userId"\)/);
  assert.equal((sql.match(/ON DELETE RESTRICT/g) ?? []).length, 6);
  assert.match(sql, /CHECK \("endsAt" > "startsAt"\)/);
  assert.match(sql, /CHECK \(\("revokedAt" IS NULL\) = \("revokedById" IS NULL\)\)/);
  assert.match(sql, /"grantedById" <> "userId"/); assert.match(sql, /CHECK \("actorId" <> "targetUserId"\)/);
});

test('database guards: grants only for enabled students by admins, no physical deletion, append-only audit', () => {
  assert.match(proposal, /"role" = 'STUDENT' AND "disabledAt" IS NULL\) THEN\s+RAISE EXCEPTION 'MANUAL_ACCESS_TARGET_NOT_STUDENT'/);
  assert.match(proposal, /"id" = NEW\."grantedById" AND "role" = 'ADMIN'/);
  assert.match(proposal, /"id" = NEW\."revokedById" AND "role" = 'ADMIN'/);
  assert.match(proposal, /BEFORE INSERT OR UPDATE ON "manual_access_grants"/);
  assert.match(proposal, /BEFORE DELETE ON "manual_access_grants"/); assert.match(proposal, /BEFORE TRUNCATE ON "manual_access_grants"/);
  assert.match(proposal, /BEFORE UPDATE OR DELETE ON "manual_access_events"/); assert.match(proposal, /BEFORE TRUNCATE ON "manual_access_events"/);
  // Event shape per action: renewals only extend, revocations carry no new period.
  assert.match(proposal, /"action" = 'RENEWED'[\s\S]*"newEndsAt" > "previousEndsAt"/);
  assert.match(proposal, /"action" = 'REVOKED'[\s\S]*"newStartsAt" IS NULL AND "newEndsAt" IS NULL/);
});

test('SQL and Prisma proposal agree on names, columns and enum values; schema.prisma holds exactly the proposal', () => {
  const { fields, models } = readManualAccessProposal();
  for (const value of ['GRANTED', 'RENEWED', 'REVOKED']) { assert.match(models, new RegExp(`\\n  ${value}\\n`)); assert.match(proposal, new RegExp(`'${value}'`)); }
  assert.match(models, /@@map\("manual_access_grants"\)/); assert.match(models, /@@map\("manual_access_events"\)/);
  assert.match(models, /userId +String +@unique/);
  for (const [table, expected] of [
    ['manual_access_grants', ['id', 'userId', 'startsAt', 'endsAt', 'revokedAt', 'grantedById', 'revokedById', 'createdAt', 'updatedAt']],
    ['manual_access_events', ['id', 'action', 'grantId', 'actorId', 'targetUserId', 'previousStartsAt', 'previousEndsAt', 'newStartsAt', 'newEndsAt', 'createdAt']],
  ]) {
    const block = proposal.slice(proposal.indexOf(`CREATE TABLE "${table}"`), proposal.indexOf('CONSTRAINT', proposal.indexOf(`CREATE TABLE "${table}"`)));
    assert.deepEqual([...withoutComments(block).matchAll(/^\s+"(\w+)" /gm)].map(m => m[1]), expected, table);
    const model = models.slice(models.indexOf(`model ${table === 'manual_access_grants' ? 'ManualAccessGrant' : 'ManualAccessEvent'} {`));
    for (const column of expected) assert.match(model, new RegExp(`\\n  ${column} +`), `${table}.${column} in Prisma`);
  }
  assert.match(fields, /manualAccessGrant +ManualAccessGrant\? +@relation\("ManualAccessGrantUser"\)/);
  // No e-mail, password, hash, plan, price or payment column anywhere in the new tables.
  assert.doesNotMatch(withoutComments(proposal), /"(email|password|hash|token|plan\w*|price|amount|payment\w*)"/i);
  const schema = read('prisma/schema.prisma');
  assert.doesNotThrow(() => stripManualAccessSchema(schema));
  assert.doesNotMatch(stripManualAccessSchema(schema), /ManualAccess|manual_access/);
});

test('09 is read-only and shows no personal data; 93 refuses to revert after any use and drops only what 08 created', () => {
  assert.match(verify, /^BEGIN TRANSACTION READ ONLY;$/m); assert.match(verify, /^ROLLBACK;$/m);
  assert.doesNotMatch(withoutComments(verify), /\b(CREATE|ALTER|DROP|INSERT|DELETE|TRUNCATE)\b|\bUPDATE\s+"/i);
  assert.doesNotMatch(withoutComments(verify), /"email"|"password"/);
  assert.match(revert, /existem concessões ou auditoria registradas/);
  assert.ok(revert.indexOf('RAISE EXCEPTION', revert.indexOf('$guard$')) < revert.indexOf('DROP TRIGGER'), 'guards run before any DROP');
  const drops = [...withoutComments(revert).matchAll(/DROP (?:TRIGGER|FUNCTION|TABLE|TYPE) "(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(drops.sort(), ['ManualAccessAction', 'manual_access_events', 'manual_access_events_no_truncate', 'manual_access_events_no_update_delete',
    'manual_access_grants', 'manual_access_grants_guard', 'manual_access_grants_guard', 'manual_access_grants_no_delete', 'manual_access_grants_no_truncate',
    'manual_access_no_delete'].sort());
  assert.doesNotMatch(withoutComments(revert), /"(users|plans|subscriptions|payments|admin_audit_events)"/);
});
