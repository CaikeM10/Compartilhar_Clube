// Offline only: reads the generated SQL files; never connects to a database or executes SQL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initialRecords, planImport, importSummary } = require('../scripts/material-catalog-import-plan.cjs');
const generator = require('../scripts/material-production-sql.cjs');

const root = path.resolve(__dirname, '..');
const catalog = require('../lib/materials/catalog.json');
const read = name => fs.readFileSync(path.join(root, 'docs/producao-migracao', name), 'utf8');
const files = generator.build();
const migration = files[generator.FILES.migration];
const verification = files[generator.FILES.verification];
const rollback = files[generator.FILES.rollback];
/** SQL without comments, for keyword checks that must ignore the explanatory header. */
const code = sql => sql.replace(/--.*$/gm, '');

test('versioned 04/05/91 files are exactly the generator output (no hand edits, LF endings)', () => {
  for (const [name, sql] of Object.entries(files)) {
    const stored = read(name);
    assert.ok(!stored.includes('\r'), `${name} must use LF`);
    assert.equal(stored, sql, `${name} is stale: run node scripts/material-production-sql.cjs --write and review`);
  }
});

test('import summary: 15 original materials, 14 published, only 014 as DRAFT; shared link 005/006 flagged', () => {
  const summary = importSummary();
  assert.equal(summary.total, 15);
  assert.equal(summary.published.length, 14);
  assert.deepEqual(summary.draft, ['material-initial-014']);
  assert.deepEqual(summary.sharedCheckoutUrl, [['material-initial-005', 'material-initial-006']]);
  const draft = initialRecords().find(row => row.id === 'material-initial-014');
  // Commercial data of 014 is kept exactly as in the catalog: only its status differs.
  assert.deepEqual({ title: draft.title, checkoutUrl: draft.checkoutUrl, priceCents: draft.priceCents, coverImage: draft.coverImage, displayOrder: draft.displayOrder },
    { title: catalog[13].title, checkoutUrl: '', priceCents: 490, coverImage: catalog[13].image, displayOrder: 13 });
});

test('planner: empty base creates 15, re-run creates 0, partial base creates only the missing IDs', () => {
  const rows = initialRecords();
  assert.equal(planImport([]).create.length, 15);
  assert.equal(planImport(rows).create.length, 0);
  const partial = planImport(rows.slice(0, 6));
  assert.deepEqual(partial.create.map(row => row.id), rows.slice(6).map(row => row.id));
  assert.deepEqual(partial.preserved, rows.slice(0, 6).map(row => row.id));
});

test('planner: any conflict or duplicate aborts the whole import, listing IDs and fields only', () => {
  const rows = initialRecords();
  for (const [index, patch, fields] of [[0, { priceCents: 1 }, ['priceCents']], [13, { status: 'PUBLISHED' }, ['status']],
    [4, { checkoutUrl: null, displayOrder: 99 }, ['checkoutUrl', 'displayOrder']]]) {
    const existing = rows.map((row, i) => i === index ? { ...row, ...patch, createdAt: new Date(), updatedAt: new Date() } : row);
    assert.throws(() => planImport(existing), error => error.code === 'MATERIAL_IMPORT_CONFLICT'
      && JSON.stringify(error.conflicts) === JSON.stringify([{ id: rows[index].id, fields }]));
  }
  // A conflict in a partial base aborts even though other IDs are missing: nothing is planned for creation.
  assert.throws(() => planImport([{ ...rows[2], title: 'Editado' }]), /MATERIAL_IMPORT_CONFLICT/);
  assert.throws(() => planImport([rows[0], rows[0]]), /DUPLICATE_MATERIAL_ID/);
});

test('planner: extra records (not in the catalog) are preserved and never planned for writing', () => {
  const extra = { id: 'ck-admin-created', title: 'Criado pelo admin', status: 'DRAFT' };
  const plan = planImport([extra]);
  assert.deepEqual(plan.extras, ['ck-admin-created']);
  assert.equal(plan.create.length, 15);
  assert.ok(!plan.create.some(row => row.id === extra.id));
});

test('SQL literals escape quotes and reject unsupported values', () => {
  assert.equal(generator.literal("Jogo d'Água"), "'Jogo d''Água'");
  assert.equal(generator.literal(null), 'NULL');
  assert.equal(generator.literal(false), 'false');
  assert.equal(generator.literal(490), '490');
  assert.throws(() => generator.literal(1.5), /UNSUPPORTED_SQL_VALUE/);
  assert.throws(() => generator.literal('a\0b'), /INVALID_SQL_STRING/);
});

test('04: one transaction, preconditions first, reviewed DDL verbatim, 15 inserts from the catalog, postconditions last', () => {
  const sql = code(migration);
  // REPEATABLE READ: before/after fingerprints share one snapshot, so concurrent legitimate writes do not abort.
  assert.match(sql, /^\s*SET client_encoding = 'UTF8';\nBEGIN ISOLATION LEVEL REPEATABLE READ;/);
  assert.match(sql, /COMMIT;\s*$/);
  // Transaction BEGIN statements only (PL/pgSQL blocks use a bare "BEGIN" line without semicolon).
  assert.equal((sql.match(/^BEGIN\b[^\n]*;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/\bCOMMIT;/g) ?? []).length, 1);
  assert.match(sql, /SET LOCAL lock_timeout = '5s';/);
  const order = ['DO $pre$', '_materials_before', 'CREATE TYPE "MaterialStatus"', 'INSERT INTO "materials"', 'DO $post$', 'COMMIT;']
    .map(marker => sql.indexOf(marker));
  assert.ok(order.every(position => position >= 0) && order.every((position, i) => i === 0 || position > order[i - 1]), String(order));
  assert.ok(migration.includes(generator.proposalDdl()), 'DDL must equal prisma/proposals/materials.sql');
  for (const row of initialRecords()) {
    assert.ok(migration.includes(`  ${generator.tuple(row).slice(0, -1)}, CURRENT_TIMESTAMP)`), row.id);
    assert.ok(verification.includes(generator.tuple(row)) && rollback.includes(generator.tuple(row)), row.id);
  }
  assert.match(sql, /ON CONFLICT \("id"\) DO NOTHING;/);
  assert.match(sql, /'material-initial-014', 'Termômetro das Emoções', NULL, 490, 'BRL', '\/termometro\.webp', '', false, 13, 'DRAFT'/);
  assert.match(sql, /WHERE "status" = 'PUBLISHED'\) <> 14/);
});

test('04: purely additive — no destructive statement and writes only to material objects', () => {
  const sql = code(migration);
  // Clauses, not statements: temp-table lifetime and the reviewed FK actions. Each must appear exactly as expected.
  assert.equal((sql.match(/ON COMMIT DROP/g) ?? []).length, 1);
  assert.equal((sql.match(/ON DELETE RESTRICT ON UPDATE CASCADE/g) ?? []).length, 1);
  const statements = sql.replace('ON COMMIT DROP', '').replace('ON DELETE RESTRICT ON UPDATE CASCADE', '');
  assert.doesNotMatch(statements, /\b(DROP|TRUNCATE|DELETE|UPDATE|GRANT|REVOKE)\b/i);
  for (const [, target] of sql.matchAll(/\bALTER TABLE\s+"?([\w]+)"?/g)) assert.ok(['materials', 'material_assets'].includes(target), target);
  for (const [, target] of sql.matchAll(/\bINSERT INTO\s+"?([\w]+)"?/g)) assert.equal(target, 'materials');
  for (const [, target] of sql.matchAll(/\bCREATE (?:UNIQUE )?INDEX\s+"\w+"\s+ON\s+"(\w+)"/g)) assert.ok(['materials', 'material_assets'].includes(target), target);
  for (const [, target] of sql.matchAll(/\bCREATE TABLE\s+"?([\w]+)"?/g)) assert.ok(['materials', 'material_assets'].includes(target), target);
  // Data that must not change is fingerprinted before and compared after.
  for (const table of ['users', 'plans', 'subscriptions', 'payments', 'lessons', 'auth_accounts']) {
    assert.match(sql, new RegExp(`AS fp_${table}\\b`)); assert.match(sql, new RegExp(`b\\.fp_${table}\\b`));
  }
});

test('05: read-only gate that rolls back and fails on any divergence', () => {
  const sql = code(verification);
  assert.match(sql, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(sql, /ROLLBACK;\s*$/);
  assert.doesNotMatch(sql, /\b(COMMIT|INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE)\b/);
  assert.match(sql, /DO \$gate\$[\s\S]*NÃO ligar MATERIALS_PERSISTENCE[\s\S]*\$gate\$;/);
  assert.match(sql, /WHERE "status" = 'PUBLISHED'\) <> 14/);
});

test('91: guards precede every DROP, and only material objects are dropped', () => {
  const sql = code(rollback);
  const drops = [...sql.matchAll(/\bDROP\s+(TABLE|TYPE)\s+"(\w+)"/g)].map(match => match[2]);
  assert.deepEqual(drops, ['material_assets', 'materials', 'MaterialAssetStatus', 'MaterialStatus']);
  assert.equal((sql.match(/\bDROP\b/g) ?? []).length, 4);
  const firstDrop = sql.indexOf('DROP TABLE');
  for (const marker of ['LOCK TABLE "materials", "material_assets" IN ACCESS EXCLUSIVE MODE', 'DO $guard$', 'existem arquivos em material_assets', 'materiais editados ou adicionados']) {
    const position = sql.indexOf(marker);
    assert.ok(position >= 0 && position < firstDrop, marker);
  }
  assert.doesNotMatch(sql, /\b(TRUNCATE|DELETE|UPDATE|INSERT)\b/);
  assert.match(sql, /COMMIT;\s*$/);
});
