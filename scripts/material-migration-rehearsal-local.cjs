// Etapa 4 — local, controlled homologation of the materials migration (04/05/91), import planner,
// PostgreSQL constraints and the material service (CRUD + ADMIN/STUDENT authorization).
// Target: ONLY the validated local test database (scripts/auth-test-safety.cjs). Never Neon.
// Phase A is READ ONLY. Phases B and C each run in ONE transaction that always ends in ROLLBACK;
// afterwards the script proves nothing persisted (scratch schema gone, public fingerprints identical).
// Output: counts, codes, IDs of catalog materials and booleans only (no credentials, no user data).
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const ts = require('typescript');
const { loadTarget, verifyServer } = require('./auth-test-safety.cjs');
const { splitStatements, adapt, run, expectFailure, seedLegacy, plain, fingerprintSql } = require('./migration-rehearsal-local.cjs');
const { initialRecords, planImport, importSummary } = require('./material-catalog-import-plan.cjs');
const generator = require('./material-production-sql.cjs');

const root = path.resolve(__dirname, '..');
const ROLLBACK = new Error('REHEARSAL_ROLLBACK');
const COLUMNS = generator.COLUMNS.map(column => `"${column}"`).join(', ');
const check = (condition, code) => { if (!condition) throw new Error(code); };

/** Like expectFailure, but reports the PostgreSQL message when the pattern does not match (constraint text only). */
async function expectConstraint(tx, name, statements, pattern) {
  await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
  try { await run(tx, statements); }
  catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`);
    const message = String(error.meta?.message || error.message || '');
    const match = message.match(pattern);
    if (!match) throw new Error(`UNEXPECTED_FAILURE_${name}: ${message.replace(/\s+/g, ' ').slice(0, 240)}`);
    return match[0];
  }
  throw new Error(`EXPECTED_FAILURE_DID_NOT_HAPPEN_${name}`);
}

/** Loads a TypeScript module the same way the offline tests do (server-only stripped, explicit imports). */
function loadTs(file, overrides = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace('import "server-only";', '');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(name => Object.hasOwn(overrides, name) ? overrides[name] : require(name), module, module.exports);
  return module.exports;
}

/** Full-row fingerprints of the local public data this rehearsal must leave untouched. */
const publicFingerprintSql = `
SELECT 'materials' AS t, count(*) AS n, md5(coalesce(string_agg(md5(m::text), '' ORDER BY id), '')) AS fp FROM public.materials m
UNION ALL SELECT 'material_assets', count(*), md5(coalesce(string_agg(md5(a::text), '' ORDER BY id), '')) FROM public.material_assets a
UNION ALL SELECT 'users', count(*), md5(coalesce(string_agg(md5(u::text), '' ORDER BY id), '')) FROM public.users u
UNION ALL SELECT 'subscriptions', count(*), md5(coalesce(string_agg(md5(s::text), '' ORDER BY id), '')) FROM public.subscriptions s
UNION ALL SELECT 'plans', count(*), md5(coalesce(string_agg(md5(p::text), '' ORDER BY id), '')) FROM public.plans p
UNION ALL SELECT 'payments', count(*), md5(coalesce(string_agg(md5(p::text), '' ORDER BY id), '')) FROM public.payments p`;
const publicFingerprints = async db => plain(await db.$queryRawUnsafe(publicFingerprintSql));
// Same column order as initialRecords(); the enum is read as text.
const SELECT_COLUMNS = generator.COLUMNS.map(column => column === 'status' ? '"status"::text AS status' : `"${column}"`).join(', ');
const materialRows = async (tx, table = 'materials') => plain(await tx.$queryRawUnsafe(`SELECT ${SELECT_COLUMNS} FROM ${table} ORDER BY id`));

// ---------------------------------------------------------------------------------------------
// Phase A — read only: identity, local state, material 014.
// ---------------------------------------------------------------------------------------------
async function inspectLocal(db) {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const server = await verifyServer(tx);
    const rows = await materialRows(tx, 'public.materials');
    let plan;
    try { plan = { ...planImport(rows), conflicts: [] }; }
    catch (error) { if (error.code !== 'MATERIAL_IMPORT_CONFLICT') throw error; plan = { conflicts: error.conflicts }; }
    const catalogIds = new Set(initialRecords().map(row => row.id));
    const row014 = rows.find(row => row.id === 'material-initial-014');
    const expected014 = initialRecords().find(row => row.id === 'material-initial-014');
    const [assets] = plain(await tx.$queryRawUnsafe(`SELECT count(*) AS total, count(*) FILTER (WHERE "materialId" = 'material-initial-014') AS for_014 FROM public.material_assets`));
    const [leftovers] = plain(await tx.$queryRawUnsafe(`SELECT count(*) AS n FROM pg_namespace WHERE nspname LIKE 'rehearsal\\_%'`));
    return {
      rehearsalSchemasPresent: leftovers.n,
      server: { database: server.database, user: server.username, host: server.host, port: server.port, version: server.version },
      materials: { total: rows.length, byStatus: rows.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {}),
        extras: rows.filter(row => !catalogIds.has(row.id)).map(row => row.id) },
      assets,
      importPlan: plan,
      material014: row014 && {
        stored: { status: row014.status, checkoutUrl: row014.checkoutUrl },
        expectedByNewRule: { status: expected014.status, checkoutUrl: expected014.checkoutUrl },
        commercialFieldsIdentical: generator.COLUMNS.filter(column => column !== 'status').every(column => row014[column] === expected014[column]),
      },
    };
  }, { timeout: 30000 });
}

// ---------------------------------------------------------------------------------------------
// Phase B — 04/05/91 in a scratch schema (prerequisites: legacy schema + real 01/02).
// ---------------------------------------------------------------------------------------------
const materialFile = (name, schema, savepoint) => adapt(name, schema, savepoint);
/** 04 statements with extra statements injected right after the first statement matching `after`. */
function inject(statements, after, extra) {
  const index = statements.findIndex(statement => after.test(statement));
  check(index !== -1, 'INJECTION_POINT_NOT_FOUND');
  return [...statements.slice(0, index + 1), ...extra, ...statements.slice(index + 1)];
}

async function rehearseMigration(db) {
  const schema = `rehearsal_${randomBytes(6).toString('hex')}`;
  const legacyDdl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff',
    '--from-empty', '--to-schema-datamodel', path.join(root, 'docs/auth-preparation/before.prisma'), '--script'],
  { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PRISMA_HIDE_UPDATE_MESSAGE: '1' } });
  const report = { schemaPrefix: 'rehearsal_' };
  const f04 = generator.FILES.migration, f05 = generator.FILES.verification, f91 = generator.FILES.rollback;
  try {
    await db.$transaction(async tx => {
      await verifyServer(tx);
      await tx.$executeRawUnsafe(`CREATE SCHEMA ${schema}`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path = ${schema}`);
      await run(tx, splitStatements(legacyDdl));
      await seedLegacy(tx);
      await run(tx, adapt('01-auth-better-auth.sql', schema, 's01'));
      await run(tx, adapt('02-lessons.sql', schema, 's02'));
      await tx.$executeRawUnsafe('DROP TABLE pg_temp._migration_before'); // harness: 01 COMMITs in production (ON COMMIT DROP)
      // Synthetic auth/lesson rows so the 04 fingerprints cover non-empty tables.
      await tx.$executeRawUnsafe(`INSERT INTO auth_accounts (id, "accountId", "providerId", "userId", password)
        VALUES ('cacct-rehearsal-1', 'cuser00000000000000000001', 'credential', 'cuser00000000000000000001', 'scrypt$synthetic')`);
      await tx.$executeRawUnsafe(`INSERT INTO auth_sessions (id, "userId", token, "expiresAt", "updatedAt")
        VALUES ('csess-rehearsal-1', 'cuser00000000000000000001', 'synthetic-token', now() + interval '1 day', now())`);
      await tx.$executeRawUnsafe(`INSERT INTO lessons (id, title, description, "videoUrl", "durationMinutes", position, status, "updatedAt")
        VALUES ('clesson-rehearsal-1', 'Aula sintética', 'x', 'https://example.invalid/v', 10, 0, 'PUBLISHED', now())`);
      const legacyBefore = plain(await tx.$queryRawUnsafe(fingerprintSql));

      // Fail-safe of 04: a write between the fingerprint snapshot and the postcondition aborts everything.
      const base04 = materialFile(f04, schema, 's04x');
      report.failSafe = {
        concurrentPaymentWrite: await expectFailure(tx, 'inj1', inject(base04, /_materials_before/, [
          `UPDATE payments SET status = 'refunded' WHERE id = 'cpay000000000000000000001'`]), /POSTCONDITION: [^\n"]+/),
        alteredImportedValue: await expectFailure(tx, 'inj2', inject(base04, /^INSERT INTO "materials"/, [
          `UPDATE materials SET title = title || ' ' WHERE id = 'material-initial-004'`]), /POSTCONDITION: [^\n"]+/),
        objectsAfterAbort: plain(await tx.$queryRawUnsafe(`SELECT count(*) AS n FROM pg_class WHERE relnamespace = '${schema}'::regnamespace AND relname IN ('materials', 'material_assets')`))[0].n,
      };
      check(report.failSafe.objectsAfterAbort === 0, 'ABORTED_04_LEFT_OBJECTS');

      // Apply 04.
      const started = Date.now();
      await run(tx, materialFile(f04, schema, 's04'));
      report.apply04ms = Date.now() - started;
      const imported = await materialRows(tx);
      report.imported = { total: imported.length, published: imported.filter(row => row.status === 'PUBLISHED').length,
        draft: imported.filter(row => row.status === 'DRAFT').map(row => row.id),
        identicalToCatalog: JSON.stringify(imported) === JSON.stringify(initialRecords()) };
      check(report.imported.identicalToCatalog, 'IMPORTED_ROWS_DIFFER');
      report.legacyFingerprintsAfter04 = JSON.stringify(plain(await tx.$queryRawUnsafe(fingerprintSql))) === JSON.stringify(legacyBefore);
      await tx.$executeRawUnsafe('DROP TABLE pg_temp._materials_before'); // harness: in production 04 COMMITs (ON COMMIT DROP)
      report.rerun04 = await expectFailure(tx, 'r04', materialFile(f04, schema, 's04b'), /PRECONDITION: [^\n"]+/);

      // 05: gate passes; sections as expected.
      const gate = await run(tx, materialFile(f05, schema, 's05'));
      const section = predicate => gate.find(rows => predicate(rows)) ?? [];
      report.verification05 = {
        objects: gate[0]?.[0],
        byStatus: Object.fromEntries((section(rows => rows.length && 'status' in rows[0] && 'total' in rows[0])).map(row => [row.status, row.total])),
        divergentRows: gate.filter(rows => rows.length && 'origem' in rows[0]).flat().length,
        assets: section(rows => rows.length && 'material_assets' in rows[0])[0]?.material_assets,
        gatePassed: true,
      };
      report.gateBlocks = {
        material014Published: await gateFailure(tx, 'g1', schema, `UPDATE materials SET status = 'PUBLISHED' WHERE id = 'material-initial-014'`),
        priceChanged: await gateFailure(tx, 'g2', schema, `UPDATE materials SET "priceCents" = "priceCents" + 1 WHERE id = 'material-initial-001'`),
        rowMissing: await gateFailure(tx, 'g3', schema, `DELETE FROM materials WHERE id = 'material-initial-015'`),
      };

      // PostgreSQL constraints (each in its own savepoint).
      const asset = (id, extra = {}) => {
        const row = { id, materialId: 'material-initial-001', storageKey: `materials/rehearsal/${id}.pdf`, originalFilename: 'a.pdf',
          mimeType: 'application/pdf', fileSize: 10, checksum: null, version: 1, status: 'PENDING', ...extra };
        return `INSERT INTO material_assets (id, "materialId", "storageKey", "originalFilename", "mimeType", "fileSize", checksum, version, status, "updatedAt")
          VALUES (${[row.id, row.materialId, row.storageKey, row.originalFilename, row.mimeType, row.fileSize, row.checksum, row.version, row.status].map(generator.literal).join(', ')}, now())`;
      };
      const sha = 'a'.repeat(64);
      const violations = {
        priceNegative: [[`UPDATE materials SET "priceCents" = -1 WHERE id = 'material-initial-001'`], /materials_price_nonnegative/],
        currencyNotBrl: [[`UPDATE materials SET currency = 'USD' WHERE id = 'material-initial-001'`], /materials_currency_brl/],
        orderNegative: [[`UPDATE materials SET "displayOrder" = -1 WHERE id = 'material-initial-001'`], /materials_order_nonnegative/],
        statusOutsideEnum: [[`UPDATE materials SET status = 'DELETED' WHERE id = 'material-initial-001'`], /enum "MaterialStatus"/], // server messages may be localized; match the type name
        assetNotPdf: [[asset('a1', { mimeType: 'text/html' })], /material_assets_pdf_only/],
        assetSizeZero: [[asset('a2', { fileSize: 0 })], /material_assets_size_positive/],
        assetVersionZero: [[asset('a3', { version: 0 })], /material_assets_version_positive/],
        validatedWithoutChecksum: [[asset('a4', { status: 'VALIDATED' })], /material_assets_validated_checksum/],
        twoValidatedPerMaterial: [[asset('a5', { status: 'VALIDATED', checksum: sha }), asset('a6', { status: 'VALIDATED', checksum: sha, version: 2 })], /\("materialId"\)=/], // partial unique index material_assets_one_validated (the DETAIL names the key)
        unknownMaterial: [[asset('a7', { materialId: 'does-not-exist' })], /material_assets_materialId_fkey/],
        deleteWithAsset: [[asset('a8'), `DELETE FROM materials WHERE id = 'material-initial-001'`], /material_assets_materialId_fkey/],
        duplicateStorageKey: [[asset('a9'), asset('a10', { storageKey: 'materials/rehearsal/a9.pdf', version: 2 })], /\("storageKey"\)=/], // unique material_assets_storageKey_key
        duplicateVersion: [[asset('a11'), asset('a12')], /\("materialId", version\)=/], // unique material_assets_materialId_version_key
        missingUpdatedAt: [[`INSERT INTO materials (id, title, "priceCents", "coverImage", "displayOrder") VALUES ('x', 'x', 1, '/x.webp', 99)`],
          /\(x, x, null, 1, BRL, \/x\.webp, null, f, 99, DRAFT, [^,]+, null\)/], // NOT NULL "updatedAt": failing row ends with null
      };
      report.constraints = {};
      for (const [name, [statements, pattern]] of Object.entries(violations)) {
        report.constraints[name] = await expectConstraint(tx, `c_${name}`, statements, pattern);
      }
      report.constraints.validPendingAssetAccepted = await tx.$executeRawUnsafe(asset('ok1')) === 1;
      await tx.$executeRawUnsafe(`DELETE FROM material_assets WHERE id = 'ok1'`);

      // Import planner against real PostgreSQL rows.
      report.import = await rehearseImport(tx);

      // 91: refuses with data/edits; otherwise removes only material objects; 04 can be re-applied.
      report.rollback91 = {
        refusedWithAsset: await expectFailure(tx, 'r91a', [asset('g1'), ...materialFile(f91, schema, 's91a')], /GUARD: [^\n"]+/),
        refusedWithEdit: await expectFailure(tx, 'r91b', [`UPDATE materials SET title = 'Editado' WHERE id = 'material-initial-002'`, ...materialFile(f91, schema, 's91b')], /GUARD: [^\n"]+/),
        refusedWithExtra: await expectFailure(tx, 'r91c', [`INSERT INTO materials (${COLUMNS}, "updatedAt") VALUES ('extra-admin', 'Extra', NULL, 100, 'BRL', '/x.webp', NULL, false, 99, 'DRAFT', now())`, ...materialFile(f91, schema, 's91c')], /GUARD: [^\n"]+/),
      };
      await run(tx, materialFile(f91, schema, 's91'));
      const left = plain(await tx.$queryRawUnsafe(`SELECT
        (SELECT count(*) FROM pg_class WHERE relnamespace = '${schema}'::regnamespace AND relname IN ('materials', 'material_assets')) AS tables,
        (SELECT count(*) FROM pg_type WHERE typnamespace = '${schema}'::regnamespace AND typname IN ('MaterialStatus', 'MaterialAssetStatus')) AS enums,
        (SELECT count(*) FROM pg_class WHERE relnamespace = '${schema}'::regnamespace AND relname IN ('users', 'auth_accounts', 'auth_sessions', 'lessons', 'payments')) AS kept_tables`))[0];
      report.rollback91.removed = { ...left, legacyFingerprintsIdentical: JSON.stringify(plain(await tx.$queryRawUnsafe(fingerprintSql))) === JSON.stringify(legacyBefore) };
      await run(tx, materialFile(f04, schema, 's04c'));
      report.rollback91.reapply04 = (await materialRows(tx)).length === 15 ? 'ok' : 'FAILED';
      throw ROLLBACK;
    }, { maxWait: 10000, timeout: 180000 });
  } catch (error) { if (error !== ROLLBACK) throw error; }
  report.persisted = plain(await db.$queryRawUnsafe(`SELECT count(*) AS n FROM pg_namespace WHERE nspname = '${schema}'`))[0].n !== 0;
  return report;
}

async function gateFailure(tx, name, schema, change) {
  return expectFailure(tx, name, [change, ...adapt(generator.FILES.verification, schema, `${name}s`)], /TRAVA: [^\n"]+/);
}

async function rehearseImport(tx) {
  const result = {};
  const rows = await materialRows(tx);
  const plan = planImport(rows);
  result.fullBase = { create: plan.create.length, preserved: plan.preserved.length, extras: plan.extras.length };
  const insert = records => `INSERT INTO materials (${COLUMNS}, "updatedAt") VALUES ${records.map(record => `${generator.tuple(record).slice(0, -1)}, now())`).join(', ')} ON CONFLICT ("id") DO NOTHING`;
  result.rerunInsertedRows = await tx.$executeRawUnsafe(insert(initialRecords()));

  await tx.$executeRawUnsafe('SAVEPOINT imp_partial');
  await tx.$executeRawUnsafe(`DELETE FROM materials WHERE id IN ('material-initial-003', 'material-initial-009', 'material-initial-014')`);
  const partial = planImport(await materialRows(tx));
  const inserted = await tx.$executeRawUnsafe(insert(partial.create));
  const restored = await materialRows(tx);
  result.partialBase = { planned: partial.create.map(row => row.id), inserted,
    restoredIdenticalToCatalog: JSON.stringify(restored) === JSON.stringify(initialRecords()), secondPlanCreates: planImport(restored).create.length };
  await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT imp_partial');

  await tx.$executeRawUnsafe('SAVEPOINT imp_conflict');
  await tx.$executeRawUnsafe(`UPDATE materials SET status = 'PUBLISHED' WHERE id = 'material-initial-014'`);
  try { planImport(await materialRows(tx)); result.conflict = 'NOT_DETECTED'; }
  catch (error) { result.conflict = { code: error.code, conflicts: error.conflicts }; }
  await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT imp_conflict');

  await tx.$executeRawUnsafe('SAVEPOINT imp_extra');
  await tx.$executeRawUnsafe(`INSERT INTO materials (${COLUMNS}, "updatedAt") VALUES ('extra-admin', 'Extra', NULL, 100, 'BRL', '/x.webp', NULL, false, 99, 'DRAFT', now())`);
  const withExtra = planImport(await materialRows(tx));
  result.extraPreserved = { extras: withExtra.extras, create: withExtra.create.length,
    untouchedAfterRerun: (await tx.$executeRawUnsafe(insert(initialRecords()))) === 0 && (await materialRows(tx)).some(row => row.id === 'extra-admin') };
  await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT imp_extra');
  return result;
}

// ---------------------------------------------------------------------------------------------
// Phase C — real service + real authorization over the local public schema, always rolled back.
// ---------------------------------------------------------------------------------------------
async function rehearseService(db) {
  const validation = loadTs('lib/materials/validation.ts');
  const storageModule = loadTs('lib/storage/private-storage.ts');
  const core = loadTs('lib/materials/service-core.ts', { './validation': validation, '@/lib/storage/private-storage': storageModule });
  const authCore = loadTs('lib/auth/authorization-core.ts');
  const knownCovers = require('../lib/materials/catalog.json').map(item => item.image);
  const tag = randomBytes(4).toString('hex');
  const ids = { admin: `rehearsal-admin-${tag}`, student: `rehearsal-student-${tag}`, subscriber: `rehearsal-subscriber-${tag}`, plan: `rehearsal-plan-${tag}` };
  const report = {};
  try {
    await db.$transaction(async tx => {
      await verifyServer(tx);
      await tx.$executeRawUnsafe(`INSERT INTO public.plans (id, name, price, duration) VALUES ($1, $2, 1, 1)`, ids.plan, `ensaio-${tag}`);
      for (const [key, role] of [['admin', 'ADMIN'], ['student', 'STUDENT'], ['subscriber', 'STUDENT']]) {
        await tx.$executeRawUnsafe(`INSERT INTO public.users (id, email, role) VALUES ($1, $2, $3::public."Role")`, ids[key], `${key}-${tag}@example.invalid`, role);
      }
      await tx.$executeRawUnsafe(`INSERT INTO public.subscriptions (id, "userId", "planId", status, "startDate", "endDate")
        VALUES ($1, $2, $3, 'active', now() - interval '1 day', now() + interval '30 days')`, `rehearsal-sub-${tag}`, ids.subscriber, ids.plan);

      // Real Prisma transaction client; nested $transaction emulated with SAVEPOINT (error => ROLLBACK TO SAVEPOINT).
      let depth = 0;
      const client = new Proxy(tx, { get(target, key) {
        if (key !== '$transaction') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
        return async fn => {
          const savepoint = `svc_${++depth}`;
          await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
          try { const result = await fn(client); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`); return result; }
          catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`); throw error; }
        };
      } });
      const guardsFor = userId => authCore.createAuthorization(
        { api: { getSession: async () => userId ? { user: { id: userId }, session: { id: 's', expiresAt: new Date(Date.now() + 3600000) } } : null } },
        tx, async () => new Headers());
      const serviceFor = userId => core.createMaterialService(client, guardsFor(userId), storageModule.unconfiguredStorage, { knownCovers });
      const outcome = async promise => { try { await promise; return 'ok'; } catch (error) { return `${error.status ?? '?'} ${error.code ?? error.message}`; } };
      const fingerprint = async () => JSON.stringify(plain(await tx.$queryRawUnsafe(publicFingerprintSql)).filter(row => row.t.startsWith('material')));

      const admin = serviceFor(ids.admin);
      const draft = { title: `ENSAIO ${tag}`, description: null, priceCents: 100, currency: 'BRL', coverImage: knownCovers[0], checkoutUrl: null, isPremium: false, displayOrder: 99 };
      const created = await admin.create(draft);
      report.admin = { createdStatus: created.status };
      report.admin.invalidCover = await outcome(admin.create({ ...draft, coverImage: '/nao-existe.webp' }));
      report.admin.publishWithoutLink = await outcome(admin.change(created.id, { expectedUpdatedAt: created.updatedAt.toISOString(), data: { status: 'PUBLISHED' } }));
      const afterRefusal = await tx.material.findUniqueOrThrow({ where: { id: created.id } });
      report.admin.rowIntactAfterRefusal = afterRefusal.status === 'DRAFT' && afterRefusal.updatedAt.getTime() === created.updatedAt.getTime();
      const published = await admin.change(created.id, { expectedUpdatedAt: created.updatedAt.toISOString(), data: { status: 'PUBLISHED', checkoutUrl: 'https://go.hotmart.com/ENSAIO' } });
      report.admin.publishWithLink = published.status;
      // Prisma fixes the @updatedAt instant once per interactive transaction, and this whole phase is ONE transaction.
      // Simulate another administrator's committed edit by advancing updatedAt, then retry with the old value.
      await tx.$executeRawUnsafe(`UPDATE public.materials SET "updatedAt" = "updatedAt" + interval '1 second' WHERE id = $1`, created.id);
      report.admin.staleEdit = await outcome(admin.change(created.id, { expectedUpdatedAt: published.updatedAt.toISOString(), data: { title: 'x' } }));
      const fresh = await tx.material.findUniqueOrThrow({ where: { id: created.id } });
      report.admin.titleUnchangedAfterStaleEdit = fresh.title === draft.title;
      report.admin.clearLinkOfPublished = await outcome(admin.change(created.id, { expectedUpdatedAt: fresh.updatedAt.toISOString(), data: { checkoutUrl: null } }));
      report.admin.malformedId = await outcome(admin.change('../x', { expectedUpdatedAt: fresh.updatedAt.toISOString(), data: { title: 'x' } }));
      report.admin.visibleInStorefront = (await admin.listPublished()).some(row => row.id === created.id);

      const active = await tx.material.findMany({ where: { status: { not: 'ARCHIVED' } }, orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }], select: { id: true } });
      const order = [created.id, ...active.map(row => row.id).filter(id => id !== created.id)];
      report.admin.reorderIncomplete = await outcome(admin.reorder({ order: order.slice(1) }));
      await admin.reorder({ order });
      report.admin.reorderFirstInStorefront = (await admin.listPublished())[0]?.id === created.id;
      const current = await tx.material.findUniqueOrThrow({ where: { id: created.id } });
      const archived = await admin.change(created.id, { expectedUpdatedAt: current.updatedAt.toISOString(), data: { status: 'ARCHIVED' } });
      report.admin.archivedHiddenFromStorefront = !(await admin.listPublished()).some(row => row.id === created.id);
      const restored = await admin.change(created.id, { expectedUpdatedAt: archived.updatedAt.toISOString(), data: { status: 'DRAFT' } });
      report.admin.restoredStatus = restored.status;

      // Non-admins: every admin operation refused, material data unchanged.
      report.nonAdmin = {};
      for (const [label, userId] of [['anonymous', null], ['studentWithoutSubscription', ids.student], ['studentWithActiveSubscription', ids.subscriber]]) {
        const service = serviceFor(userId);
        const before = await fingerprint();
        const results = {
          listAdmin: await outcome(service.listAdmin()),
          create: await outcome(service.create(draft)),
          editPrice: await outcome(service.change('material-initial-001', { expectedUpdatedAt: new Date().toISOString(), data: { priceCents: 1 } })),
          publish: await outcome(service.change(created.id, { expectedUpdatedAt: restored.updatedAt.toISOString(), data: { status: 'PUBLISHED' } })),
          archive: await outcome(service.change('material-initial-001', { expectedUpdatedAt: new Date().toISOString(), data: { status: 'ARCHIVED' } })),
          reorder: await outcome(service.reorder({ order })),
          pdfStart: await outcome(service.pdf('material-initial-001', { action: 'start', filename: 'a.pdf', contentType: 'application/pdf', size: 10 })),
          removePdf: await outcome(service.removePdf('material-initial-001', { assetId: 'x' })),
        };
        report.nonAdmin[label] = { results, materialDataUnchanged: (await fingerprint()) === before };
      }
      report.subscriberLibrary = await outcome(serviceFor(ids.subscriber).listLibrary());
      report.subscriberLibraryCount = (await serviceFor(ids.subscriber).listLibrary()).length;
      report.studentWithoutSubscriptionLibrary = await outcome(serviceFor(ids.student).listLibrary());
      throw ROLLBACK;
    }, { maxWait: 10000, timeout: 120000 });
  } catch (error) { if (error !== ROLLBACK) throw error; }
  return report;
}

async function main() {
  const url = loadTarget(root);
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  try {
    await verifyServer(db);
    const before = await publicFingerprints(db);
    const report = { at: new Date().toISOString(), summary: importSummary() };
    report.local = await inspectLocal(db);
    if (process.argv.includes('--read-only')) { console.log(JSON.stringify(report, null, 2)); return; }
    report.migration = await rehearseMigration(db);
    report.service = await rehearseService(db);
    const after = await publicFingerprints(db);
    report.publicDataIdenticalAfterRehearsal = JSON.stringify(before) === JSON.stringify(after);
    report.publicCounts = Object.fromEntries(after.map(row => [row.t, row.n]));
    const output = path.join(root, 'docs/producao-migracao/resultados', `ensaio-materiais-local-${report.at.slice(0, 10)}.json`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!report.publicDataIdenticalAfterRehearsal || report.migration.persisted) throw new Error('REHEARSAL_PERSISTED_CHANGES');
  } finally { await db.$disconnect(); }
}

if (require.main === module) main().catch(error => {
  console.error(/^[A-Z0-9_]+$/.test(error.message || '') ? error.message : `REHEARSAL_FAILED: ${String(error.meta?.message || error.message || error.code || 'unknown').slice(0, 400)}`);
  process.exitCode = 1;
});
