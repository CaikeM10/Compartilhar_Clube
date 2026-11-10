// Explicit local-only operation. No dotenv, inherited database target or destructive rollback.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { loadTarget, verifyServer } = require('./auth-test-safety.cjs');
const { initialRecords, planImport } = require('./material-catalog-import-plan.cjs');
const root = path.resolve(__dirname, '..');
const hash = data => createHash('sha256').update(data).digest('hex');
const sqlPath = path.join(root, 'prisma/proposals/materials.sql');
const receiptPath = path.join(root, 'docs/catalogo/local-persistence.json');
const pgBin = 'C:/Program Files/PostgreSQL/18/bin';

function backup(url) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clube-materials-backup-'));
  const file = path.join(directory, 'before.dump');
  const parsed = new URL(url);
  const env = { PGHOST: '127.0.0.1', PGPORT: '5432', PGDATABASE: 'compartilhar_auth_test',
    PGUSER: 'compartilhar_auth_test_user', PGPASSWORD: decodeURIComponent(parsed.password),
    PGCONNECT_TIMEOUT: '5' };
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  const run = (exe, args) => {
    const result = spawnSync(path.join(pgBin, exe + '.exe'), args, { env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
    if (result.status !== 0) throw new Error('BACKUP_VERIFICATION_FAILED');
    return result.stdout;
  };
  run('pg_dump', ['--no-password', '--format=custom', '--file', file]);
  const toc = run('pg_restore', ['--list', file]);
  // Decode every archive section without executing SQL or connecting to any database.
  run('pg_restore', ['--file', path.join(directory, 'restore-review.sql'), file]);
  assert.ok(fs.statSync(file).size > 0 && toc.includes('TABLE DATA'));
  fs.writeFileSync(path.join(directory, 'archive-list.txt'), toc);
  const result = { directory, file, sha256: hash(fs.readFileSync(file)), decoded: true };
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(result, null, 2));
  assert.equal(hash(fs.readFileSync(file)), result.sha256);
  return result;
}

async function objects(db) {
  return db.$queryRawUnsafe(`SELECT n.nspname AS schema, t.typname AS name FROM pg_type t
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE t.typname IN ('MaterialStatus','MaterialAssetStatus','materials','material_assets')
    UNION ALL SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname IN ('materials','material_assets','materials_pkey','materials_status_displayOrder_idx',
    'material_assets_pkey','material_assets_storageKey_key','material_assets_materialId_status_idx',
    'material_assets_materialId_version_key','material_assets_one_validated')`);
}
async function schemaEvidence(db) {
  return {
    columns: await db.$queryRawUnsafe(`SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default
      FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('materials','material_assets') ORDER BY table_name,ordinal_position`),
    constraints: await db.$queryRawUnsafe(`SELECT c.conname,c.contype::text AS kind,c.convalidated,pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c WHERE c.conrelid IN ('public.materials'::regclass,'public.material_assets'::regclass) ORDER BY c.conname`),
    indexes: await db.$queryRawUnsafe(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public'
      AND tablename IN ('materials','material_assets') ORDER BY indexname`),
    enums: await db.$queryRawUnsafe(`SELECT t.typname,e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
      JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname IN ('MaterialStatus','MaterialAssetStatus') ORDER BY t.typname,e.enumsortorder`),
  };
}
async function insertMissing(tx) {
  const before = await tx.$queryRawUnsafe('SELECT * FROM public.materials ORDER BY id');
  const plan = planImport(before);
  let inserted = 0;
  for (const row of plan.create) {
    inserted += await tx.$executeRawUnsafe(`INSERT INTO public.materials
      (id,title,description,"priceCents",currency,"coverImage","checkoutUrl","isPremium","displayOrder",status,"updatedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::public."MaterialStatus",CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO NOTHING`, ...Object.values(row));
  }
  const after = await tx.$queryRawUnsafe('SELECT * FROM public.materials ORDER BY id');
  for (const row of before) assert.deepEqual(after.find(x => x.id === row.id), row);
  for (const row of initialRecords()) assert.ok(after.some(x => x.id === row.id));
  return { inserted, preserved: plan.preserved.length, conflicts: plan.conflicts, after };
}
async function run(mode) {
  const rehearse = mode === '--rehearse';
  if (rehearse) mode = '--apply';
  if (!['--apply', '--import'].includes(mode)) throw new Error('EXPLICIT_MODE_REQUIRED');
  const url = loadTarget(root);
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  try {
    const target = await verifyServer(db);
    const existing = await objects(db);
    if (mode === '--apply' && existing.length) throw new Error('EXISTING_OBJECTS_STOP');
    const previous = mode === '--import' ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) : null;
    if (previous) assert.deepEqual(await schemaEvidence(db), previous.schema);
    const snapshot = backup(url); // Any failure here prevents DDL and import.
    const sql = fs.readFileSync(sqlPath, 'utf8');
    if (previous) assert.equal(hash(sql), previous.sqlSha256);
    const result = await db.$transaction(async tx => {
      await verifyServer(tx);
      await tx.$executeRawUnsafe('SET LOCAL search_path = public, pg_catalog');
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(61420320)');
      if (mode === '--apply') {
        if ((await objects(tx)).length) throw new Error('EXISTING_OBJECTS_STOP');
        // Execute the reviewed proposal unchanged, with its transaction owned by Prisma.
        const statements = sql.replace(/^--.*$/gm, '').split(';').map(x => x.trim()).filter(Boolean);
        assert.equal(statements.shift(), 'BEGIN'); assert.equal(statements.pop(), 'COMMIT');
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
      } else assert.deepEqual(await schemaEvidence(tx), previous.schema);
      await tx.$executeRawUnsafe('LOCK TABLE public.materials, public.material_assets IN SHARE ROW EXCLUSIVE MODE');
      const first = await insertMissing(tx);
      if (mode === '--apply') {
        assert.equal(first.after.length, 15); assert.equal(first.inserted, 15);
        assert.deepEqual(first.after.map(({ createdAt, updatedAt, ...row }) => row), initialRecords());
        const [assets] = await tx.$queryRawUnsafe('SELECT count(*)::int AS count FROM public.material_assets');
        assert.equal(assets.count, 0);
      }
      const second = await insertMissing(tx);
      assert.equal(second.inserted, 0); assert.deepEqual(second.after, first.after);
      const [orphans] = await tx.$queryRawUnsafe(`SELECT count(*)::int AS count FROM public.material_assets a
        LEFT JOIN public.materials m ON m.id=a."materialId" WHERE m.id IS NULL`);
      assert.equal(orphans.count, 0);
      const schema = await schemaEvidence(tx);
      // PostgreSQL 18 also reports NOT NULL constraints here; count PK/FK/CHECK separately.
      assert.equal(schema.constraints.filter(x => ['p', 'f', 'c'].includes(x.kind)).length, 10);
      assert.ok(schema.constraints.every(x => x.convalidated));
      assert.equal(schema.indexes.length, 7);
      if (rehearse) throw new Error('REHEARSAL_PASSED_ROLLED_BACK');
      return { inserted: first.inserted, preserved: first.preserved, conflicts: first.conflicts,
        count: first.after.length, repeatedInsertions: second.inserted, orphanAssets: orphans.count, schema };
    }, { timeout: 60000 });
    const receipt = { at: new Date().toISOString(), target, mode, sqlSha256: hash(sql),
      catalogSha256: hash(fs.readFileSync(path.join(root, 'lib/materials/catalog.json'))), backup: snapshot, ...result };
    fs.writeFileSync(mode === '--apply' ? receiptPath : path.join(snapshot.directory, 'import-receipt.json'), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify({ ...receipt, schema: undefined }, null, 2));
  } finally { await db.$disconnect(); }
}
module.exports = { insertMissing, schemaEvidence };
if (require.main === module) run(process.argv[2]).catch(error => {
  // Never expose driver errors or connection strings.
  console.error(/^[A-Z_]+$/.test(error.message || '') ? error.message : 'LOCAL_MATERIAL_OPERATION_FAILED');
  console.error(JSON.stringify({ type: error.name, code: error.code,
    databaseCode: error.meta?.code,
    location: error.stack?.split('\n').find(line => line.includes('local-material-catalog.cjs:'))?.trim() }));
  process.exitCode = 1;
});
