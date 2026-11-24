// Static checks of the admin user-management migration files (never executed by tests).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readProposal } = require('./admin-users-schema.cjs');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const proposal = read('prisma/proposals/admin-users.sql');
const apply = read('docs/producao-migracao/06-admin-users.sql');
const verify = read('docs/producao-migracao/07-admin-users-verificacao-somente-leitura.sql');
const revert = read('docs/producao-migracao/92-admin-users-reversao.sql');
const withoutComments = sql => sql.replace(/--.*$/gm, '');

test('06 wraps the reviewed proposal verbatim inside one transaction with pre- and postconditions', () => {
  const start = apply.indexOf('-- >>> prisma/proposals/admin-users.sql\n');
  const end = apply.indexOf('-- <<< prisma/proposals/admin-users.sql');
  assert.ok(start > 0 && end > start);
  assert.equal(apply.slice(start + '-- >>> prisma/proposals/admin-users.sql\n'.length, end), proposal);
  assert.match(apply, /^BEGIN;$/m); assert.match(apply, /^COMMIT;$/m);
  assert.match(apply, /PRECONDITION: 06 já aplicado/); assert.match(apply, /POSTCONDITION: contagens de usuários, credenciais ou sessões mudaram/);
});

test('the proposal is additive: no row is inserted, updated or deleted and nothing existing is dropped', () => {
  const sql = withoutComments(proposal);
  assert.doesNotMatch(sql, /\bDROP\b|\bTRUNCATE\s+(TABLE\s+)?"|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+"\w+"\s+SET\b/i);
  assert.match(sql, /ADD COLUMN "isPrincipalAdmin" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(sql, /ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(sql, /CHECK \(NOT "isPrincipalAdmin" OR "role" = 'ADMIN'\)/);
  assert.match(sql, /ON DELETE RESTRICT/);
});

test('database guards: principal designation only by the operator procedure, at most two, principals protected, audit append-only', () => {
  assert.match(proposal, /current_setting\('compartilhar\.principal_designation', true\)/);
  assert.match(proposal, />= 2 THEN\s+RAISE EXCEPTION 'PRINCIPAL_ADMIN_LIMIT_REACHED'/);
  assert.match(proposal, /IF TG_OP = 'INSERT' THEN\s+IF NEW\."isPrincipalAdmin" THEN\s+RAISE EXCEPTION 'PRINCIPAL_ADMIN_DESIGNATION_REQUIRED'/);
  assert.match(proposal, /NEW\."role" IS DISTINCT FROM OLD\."role" OR NEW\."disabledAt" IS DISTINCT FROM OLD\."disabledAt"/);
  assert.match(proposal, /BEFORE UPDATE OR DELETE ON "admin_audit_events"/);
  assert.match(proposal, /BEFORE TRUNCATE ON "admin_audit_events"/);
  assert.match(proposal, /"actorId" IS NOT NULL AND "actorId" <> "targetUserId"/);
  // The application never enables the operator setting.
  for (const file of ['lib/admin/user-management-core.ts', 'lib/admin/user-management.ts', 'lib/account/password-core.ts', 'lib/auth/config.ts']) {
    const source = read(file);
    assert.doesNotMatch(source, /principal_designation/, file);
    // isPrincipalAdmin may be selected or filtered on, never written.
    for (const data of source.match(/data: \{[^}]*\}/g) ?? []) assert.doesNotMatch(data, /isPrincipalAdmin/, `${file}: ${data}`);
  }
  assert.match(read('scripts/principal-admin-operator.cjs'), /set_config\('compartilhar\.principal_designation', 'on', true\)/);
});

test('SQL and Prisma proposal agree on names and enum values; no e-mail, password or hash stored in the audit table', () => {
  const { fields, models } = readProposal();
  for (const column of ['isPrincipalAdmin', 'mustChangePassword']) { assert.match(fields, new RegExp(`\\b${column}\\b`)); assert.match(proposal, new RegExp(`"${column}"`)); }
  for (const value of ['USER_CREATED', 'ROLE_CHANGED', 'PRINCIPAL_DESIGNATED', 'OPERATOR_PASSWORD_RESET']) {
    assert.match(models, new RegExp(`\\n  ${value}\\n`)); assert.match(proposal, new RegExp(`'${value}'`));
  }
  assert.match(models, /@@map\("admin_audit_events"\)/);
  const table = proposal.slice(proposal.indexOf('CREATE TABLE "admin_audit_events"'), proposal.indexOf('CREATE INDEX'));
  const columns = [...withoutComments(table).matchAll(/^\s+"(\w+)" /gm)].map(match => match[1]);
  assert.deepEqual(columns, ['id', 'action', 'actorId', 'targetUserId', 'previousRole', 'newRole', 'createdAt']);
});

test('07 is read-only and 92 refuses to revert after any use', () => {
  assert.match(verify, /^BEGIN TRANSACTION READ ONLY;$/m); assert.match(verify, /^ROLLBACK;$/m);
  assert.doesNotMatch(withoutComments(verify), /\b(CREATE|ALTER|DROP|INSERT|DELETE|TRUNCATE)\b|\bUPDATE\s+"/i);
  assert.match(revert, /existe auditoria registrada/); assert.match(revert, /principais designados ou trocas de senha pendentes/);
  assert.ok(revert.indexOf('RAISE EXCEPTION') < revert.indexOf('DROP TRIGGER'), 'guards run before any DROP');
});

test('92 refuses to revert while any object of 08 exists (order: 93 before 92)', () => {
  const start = revert.indexOf('DO $dependents$');
  const end = revert.indexOf('$dependents$;');
  assert.ok(start > 0 && end > start, '92 has a dependents guard');
  const guard = revert.slice(start, end);
  assert.match(guard, /to_regclass\('public\.manual_access_grants'\) IS NOT NULL/);
  assert.match(guard, /to_regclass\('public\.manual_access_events'\) IS NOT NULL/);
  assert.match(guard, /to_regtype\('public\."ManualAccessAction"'\) IS NOT NULL/);
  assert.match(guard, /RAISE EXCEPTION 'GUARD: objetos do 08 presentes — reverter o 93 antes do 92'/);
  const code = withoutComments(revert);
  const guardAt = code.indexOf('DO $dependents$');
  assert.ok(guardAt > code.indexOf('BEGIN;'), 'inside the transaction');
  assert.ok(guardAt < code.indexOf('LOCK TABLE'), 'before taking locks');
  assert.ok(guardAt < code.indexOf('DROP '), 'before any DROP');
  assert.match(read('docs/producao-migracao/93-manual-access-reversao.sql'), /Ordem de reversão: 93 antes de 92/);
});
