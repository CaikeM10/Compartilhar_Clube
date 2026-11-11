// In-memory only: no PrismaClient, no database, no environment files, no network.
// The storage double below exists only inside this test; the product ships no simulated provider.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function load(file, overrides = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8').replace('import "server-only";', ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(overrides, name) ? overrides[name] : require(name), module, module.exports);
  return module.exports;
}
const validation = load('lib/materials/validation.ts');
const storageModule = load('lib/storage/private-storage.ts');
const core = load('lib/materials/service-core.ts', { './validation': validation, '@/lib/storage/private-storage': storageModule });
const authorization = load('lib/auth/authorization-core.ts');
const lessonCore = load('lib/lessons/service-core.ts', { './validation': load('lib/lessons/validation.ts') });
const lessonHttp = load('lib/lessons/http.ts', { './service-core': lessonCore, '@/lib/auth/authorization-core': authorization });
const http = load('lib/materials/http.ts', {
  '@/lib/auth/authorization-core': authorization, '@/lib/lessons/service-core': lessonCore, '@/lib/lessons/http': lessonHttp,
  '@/lib/storage/private-storage': storageModule, './service-core': core,
});

const deny = code => async () => { throw new authorization.AuthorizationError(code === 'UNAUTHENTICATED' ? 401 : 403, code); };
const allow = { requireAdmin: async () => {}, requireActiveSubscription: async () => {} };
const failingDb = () => new Proxy({}, { get(_, key) { assert.fail(`Database accessed: ${String(key)}`); } });
const pdfBytes = Buffer.from('%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

function memoryStorage(objects = new Map()) {
  const calls = [];
  return {
    calls, objects, configured: true,
    async createUploadUrl(input) { calls.push(['upload', input]); return { url: 'https://storage.invalid/signed-put', method: 'PUT', headers: { 'content-type': input.contentType }, expiresAt: new Date(0) }; },
    async headObject(key) { calls.push(['head', key]); const o = objects.get(key); return o ? { size: o.bytes.length, contentType: o.contentType } : null; },
    async readObject(key) { calls.push(['read', key]); const bytes = objects.get(key).bytes; return new ReadableStream({ start(c) { c.enqueue(new Uint8Array(bytes)); c.close(); } }); },
    async deleteObject(key) { calls.push(['delete', key]); objects.delete(key); },
    async createDownloadUrl(input) { calls.push(['download', input]); return 'https://storage.invalid/signed-get'; },
  };
}

test('every new admin operation rejects anonymous and STUDENT before database or storage access', async () => {
  for (const code of ['UNAUTHENTICATED', 'FORBIDDEN']) {
    const storage = memoryStorage();
    const service = core.createMaterialService(failingDb(), { requireAdmin: deny(code), requireActiveSubscription: allow.requireActiveSubscription }, storage);
    for (const call of [() => service.getAdmin('material-initial-001'), () => service.reorder({ order: ['a'] }),
      () => service.pdf('material-initial-001', { action: 'start', filename: 'a.pdf', contentType: 'application/pdf', size: 10 }),
      () => service.pdf('material-initial-001', { action: 'confirm', assetId: 'x' }), () => service.removePdf('material-initial-001', { assetId: 'x' })]) {
      await assert.rejects(call(), error => error instanceof authorization.AuthorizationError);
    }
    assert.equal(storage.calls.length, 0);
  }
});

test('library and download reject users without an active subscription before database or storage access', async () => {
  for (const code of ['UNAUTHENTICATED', 'SUBSCRIPTION_REQUIRED']) {
    const storage = memoryStorage();
    const service = core.createMaterialService(failingDb(), { requireAdmin: allow.requireAdmin, requireActiveSubscription: deny(code) }, storage);
    await assert.rejects(service.listLibrary(), error => error.code === code);
    await assert.rejects(service.download('material-initial-001'), error => error.code === code);
    assert.equal(storage.calls.length, 0);
  }
});

test('public and library listings return only PUBLISHED rows in admin order without private fields', async () => {
  const queries = [];
  const db = { material: { findMany: async args => { queries.push(args); return args.select.assets
    ? [{ id: 'a', title: 'A', assets: [{ id: 'v1' }] }, { id: 'b', title: 'B', assets: [] }] : [{ id: 'a' }]; } } };
  const service = core.createMaterialService(db, allow);
  await service.listPublished();
  const library = await service.listLibrary();
  for (const query of queries) {
    assert.deepEqual(query.where, { status: 'PUBLISHED' });
    assert.deepEqual(query.orderBy, [{ displayOrder: 'asc' }, { id: 'asc' }]);
    assert.equal(query.include, undefined);
    assert.ok(!('status' in query.select) && !('updatedAt' in query.select));
  }
  assert.deepEqual(Object.keys(queries[0].select).sort(), ['checkoutUrl', 'coverImage', 'currency', 'description', 'id', 'isPremium', 'priceCents', 'title']);
  assert.ok(!('priceCents' in queries[1].select) && !('checkoutUrl' in queries[1].select));
  assert.deepEqual(queries[1].select.assets, { where: { status: 'VALIDATED' }, select: { id: true }, take: 1 });
  assert.deepEqual(library, [{ id: 'a', title: 'A', hasPdf: true }, { id: 'b', title: 'B', hasPdf: false }]);
});

test('admin listing exposes PDF availability but never the storage key', async () => {
  let received;
  const service = core.createMaterialService({ material: { findMany: async args => { received = args; return []; } } }, allow);
  await service.listAdmin();
  assert.deepEqual(received.include.assets.where, { status: { in: ['PENDING', 'VALIDATED'] } });
  assert.ok(!('storageKey' in received.include.assets.select));
  await assert.rejects(service.getAdmin('../etc'), error => error.status === 404);
});

test('reorder requires the complete current list, rewrites displayOrder by position and leaves archived rows alone', async () => {
  const updates = [];
  let current = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const tx = {
    $executeRawUnsafe: async sql => assert.match(sql, /pg_advisory_xact_lock/),
    material: {
      findMany: async args => { assert.deepEqual(args.where, { status: { not: 'ARCHIVED' } }); return current; },
      update: async args => updates.push(args),
    },
  };
  const service = core.createMaterialService({ $transaction: fn => fn(tx) }, allow);
  for (const order of [['a', 'b'], ['a', 'b', 'x'], ['a', 'b', 'c', 'd']]) {
    await assert.rejects(service.reorder({ order }), error => error.status === 409 && error.code === 'MATERIAL_ORDER_STALE');
  }
  for (const input of [{ order: [] }, { order: ['a', 'a'] }, { order: ['a/../b'] }, { order: ['a'], extra: true }]) {
    await assert.rejects(service.reorder(input), error => error.status === 400);
  }
  assert.equal(updates.length, 0);
  await service.reorder({ order: ['c', 'a', 'b'] });
  assert.deepEqual(updates, [
    { where: { id: 'c' }, data: { displayOrder: 0 } }, { where: { id: 'a' }, data: { displayOrder: 1 } }, { where: { id: 'b' }, data: { displayOrder: 2 } },
  ]);
});

test('publication and unpublication are status changes guarded by optimistic concurrency', async () => {
  const seen = [];
  const tx = { material: { updateMany: async args => { seen.push(args); return { count: 1 }; }, findUniqueOrThrow: async () => ({}) } };
  const service = core.createMaterialService({ $transaction: fn => fn(tx) }, allow);
  for (const status of ['PUBLISHED', 'DRAFT', 'ARCHIVED']) {
    await service.change('material-initial-001', { expectedUpdatedAt: '2026-11-06T00:00:00.000Z', data: { status } });
  }
  assert.deepEqual(seen.map(args => args.data.status), ['PUBLISHED', 'DRAFT', 'ARCHIVED']);
  await assert.rejects(service.change('material-initial-001', { expectedUpdatedAt: '2026-11-06T00:00:00.000Z', data: { status: 'DELETED' } }), e => e.status === 400);
});

test('without a configured storage provider PDF uploads fail closed with 503 and write nothing', async () => {
  const service = core.createMaterialService(failingDb(), allow);
  for (const input of [{ action: 'start', filename: 'guia.pdf', contentType: 'application/pdf', size: 1000 }, { action: 'confirm', assetId: 'asset-1' }]) {
    await assert.rejects(service.pdf('material-initial-001', input), error => error instanceof storageModule.StorageError && error.status === 503 && error.code === 'STORAGE_NOT_CONFIGURED');
  }
  for (const method of ['createUploadUrl', 'headObject', 'readObject', 'deleteObject', 'createDownloadUrl']) {
    await assert.rejects(storageModule.unconfiguredStorage[method]({}), /STORAGE_NOT_CONFIGURED/);
  }
  assert.equal(storageModule.unconfiguredStorage.configured, false);
});

test('PDF upload requests are validated for type, size and filename before any write', async () => {
  const service = core.createMaterialService(failingDb(), allow, memoryStorage());
  const base = { action: 'start', filename: 'guia.pdf', contentType: 'application/pdf', size: 1000 };
  for (const patch of [{ contentType: 'application/x-msdownload' }, { contentType: 'image/png' }, { size: 0 }, { size: validation.PDF_MAX_BYTES + 1 },
    { size: 1.5 }, { filename: 'guia.exe' }, { filename: '../guia.pdf' }, { filename: 'a\\b.pdf' }, { filename: '.pdf' }, { filename: ' guia.pdf' },
    { filename: 'guia\u0000.pdf' }, { storageKey: 'materials/other.pdf' }, { status: 'VALIDATED' }]) {
    await assert.rejects(service.pdf('material-initial-001', { ...base, ...patch }), error => error.status === 400, JSON.stringify(patch));
  }
});

function assetDb({ material = { id: 'm1' }, assets = [] } = {}) {
  const rows = assets.map(row => ({ ...row }));
  const tx = {
    $executeRawUnsafe: async () => 0,
    material: { findFirst: async args => { assert.deepEqual(args.where.status, { not: 'ARCHIVED' }); return material; } },
    materialAsset: {
      aggregate: async () => ({ _max: { version: rows.reduce((max, row) => Math.max(max, row.version), 0) || null } }),
      create: async ({ data }) => { const row = { id: `asset-${rows.length + 1}`, ...data }; rows.push(row); return row; },
      findFirst: async ({ where }) => rows.find(row => row.id === where.id && row.materialId === where.materialId && row.status === where.status) ?? null,
      findUniqueOrThrow: async ({ where }) => rows.find(row => row.id === where.id),
      updateMany: async ({ where, data }) => {
        const hits = rows.filter(row => (!where.id || row.id === where.id) && (!where.materialId || row.materialId === where.materialId) && row.status === where.status);
        for (const row of hits) Object.assign(row, data); return { count: hits.length };
      },
    },
  };
  return { rows, db: { ...tx, $transaction: fn => fn(tx) } };
}

test('upload start creates a PENDING versioned asset with an opaque key and returns only a signed PUT', async () => {
  const storage = memoryStorage();
  const { db, rows } = assetDb({ assets: [{ id: 'old', materialId: 'm1', version: 2, status: 'ARCHIVED' }] });
  const service = core.createMaterialService(db, allow, storage);
  const result = await service.pdf('m1', { action: 'start', filename: 'Guia Emoções.pdf', contentType: 'application/pdf', size: 1000 });
  assert.equal(result.version, 3);
  assert.equal(result.upload.method, 'PUT');
  assert.ok(!JSON.stringify(result).includes('materials/m1'), 'storage key must not be returned');
  const created = rows.at(-1);
  assert.equal(created.status, 'PENDING'); assert.equal(created.mimeType, 'application/pdf'); assert.equal(created.fileSize, 1000);
  assert.match(created.storageKey, /^materials\/m1\/v3-[0-9a-f-]{36}\.pdf$/);
  assert.deepEqual(storage.calls[0], ['upload', { key: created.storageKey, contentType: 'application/pdf', contentLength: 1000, expiresInSeconds: 600 }]);
});

test('upload start refuses archived or missing materials', async () => {
  const { db } = assetDb({ material: null });
  const service = core.createMaterialService(db, allow, memoryStorage());
  await assert.rejects(service.pdf('m1', { action: 'start', filename: 'a.pdf', contentType: 'application/pdf', size: 10 }), e => e.status === 404 && e.code === 'MATERIAL_NOT_FOUND');
});

test('confirm validates size, content type and %PDF- signature, stores sha256 and keeps a single VALIDATED asset', async () => {
  const key = 'materials/m1/v2-x.pdf';
  const storage = memoryStorage(new Map([[key, { bytes: pdfBytes, contentType: 'application/pdf' }]]));
  const { db, rows } = assetDb({ assets: [
    { id: 'previous', materialId: 'm1', version: 1, status: 'VALIDATED', checksum: 'a'.repeat(64) },
    { id: 'new', materialId: 'm1', version: 2, status: 'PENDING', storageKey: key, fileSize: pdfBytes.length },
  ] });
  const service = core.createMaterialService(db, allow, storage);
  await service.pdf('m1', { action: 'confirm', assetId: 'new' });
  assert.equal(rows[0].status, 'ARCHIVED');
  assert.equal(rows[1].status, 'VALIDATED');
  assert.equal(rows[1].checksum, createHash('sha256').update(pdfBytes).digest('hex'));
  await assert.rejects(service.pdf('m1', { action: 'confirm', assetId: 'new' }), e => e.status === 404 && e.code === 'PDF_UPLOAD_NOT_FOUND');
});

test('confirm rejects missing uploads, wrong sizes, wrong types and non-PDF bytes without validating them', async () => {
  const missing = assetDb({ assets: [{ id: 'p', materialId: 'm1', version: 1, status: 'PENDING', storageKey: 'k', fileSize: pdfBytes.length }] });
  await assert.rejects(core.createMaterialService(missing.db, allow, memoryStorage()).pdf('m1', { action: 'confirm', assetId: 'p' }), e => e.status === 409 && e.code === 'PDF_UPLOAD_MISSING');
  assert.equal(missing.rows[0].status, 'PENDING');
  const html = Buffer.from('<html>' + 'x'.repeat(pdfBytes.length - 6));
  for (const [stored, fileSize] of [[{ bytes: pdfBytes, contentType: 'application/pdf' }, pdfBytes.length + 1], [{ bytes: pdfBytes, contentType: 'text/html' }, pdfBytes.length],
    [{ bytes: html, contentType: 'application/pdf' }, html.length]]) {
    const storage = memoryStorage(new Map([['k', stored]]));
    const { db, rows } = assetDb({ assets: [{ id: 'p', materialId: 'm1', version: 1, status: 'PENDING', storageKey: 'k', fileSize }] });
    await assert.rejects(core.createMaterialService(db, allow, storage).pdf('m1', { action: 'confirm', assetId: 'p' }), e => e.status === 422 && e.code === 'PDF_INVALID');
    assert.equal(rows[0].status, 'REJECTED'); assert.equal(rows[0].checksum, undefined);
    assert.ok(!storage.objects.has('k'), 'rejected upload removed from the private bucket');
  }
});

test('removing a PDF archives the association without deleting the stored object', async () => {
  const storage = memoryStorage();
  const { db, rows } = assetDb({ assets: [{ id: 'v', materialId: 'm1', version: 1, status: 'VALIDATED' }] });
  const service = core.createMaterialService(db, allow, storage);
  assert.deepEqual(await service.removePdf('m1', { assetId: 'v' }), { removed: 'v' });
  assert.equal(rows[0].status, 'ARCHIVED');
  await assert.rejects(service.removePdf('m1', { assetId: 'v' }), e => e.status === 409);
  await assert.rejects(service.removePdf('other', { assetId: 'v' }), e => e.status === 409);
  assert.equal(storage.calls.length, 0);
});

test('download: unpublished/missing -> 404, no PDF -> 404, storage absent -> 503, otherwise a 60s signed URL', async () => {
  let material = null;
  const db = { material: { findFirst: async args => { assert.equal(args.where.status, 'PUBLISHED'); assert.deepEqual(args.select.assets.where, { status: 'VALIDATED' }); return material; } } };
  const storage = memoryStorage();
  const service = core.createMaterialService(db, allow, storage);
  await assert.rejects(service.download('m1'), e => e.status === 404 && e.code === 'MATERIAL_NOT_FOUND');
  material = { assets: [] };
  await assert.rejects(service.download('m1'), e => e.status === 404 && e.code === 'PDF_NOT_AVAILABLE');
  await assert.rejects(core.createMaterialService(db, allow).download('m1'), e => e.status === 404);
  material = { assets: [{ storageKey: 'materials/m1/v1.pdf', originalFilename: 'guia.pdf' }] };
  await assert.rejects(core.createMaterialService(db, allow).download('m1'), e => e.status === 503 && e.code === 'STORAGE_NOT_CONFIGURED');
  assert.equal(await service.download('m1'), 'https://storage.invalid/signed-get');
  assert.deepEqual(storage.calls.at(-1), ['download', { key: 'materials/m1/v1.pdf', filename: 'guia.pdf', expiresInSeconds: 60 }]);
  await assert.rejects(service.download('../../m1'), e => e.status === 404);
});

test('HTTP layer maps domain, storage and auth errors, sanitizes unknown errors and never caches', async () => {
  for (const [error, status, code] of [[new core.MaterialError(409, 'MATERIAL_ORDER_STALE'), 409, 'MATERIAL_ORDER_STALE'],
    [new storageModule.StorageError(503, 'STORAGE_NOT_CONFIGURED'), 503, 'STORAGE_NOT_CONFIGURED'],
    [new authorization.AuthorizationError(403, 'SUBSCRIPTION_REQUIRED'), 403, 'SUBSCRIPTION_REQUIRED'],
    [new lessonCore.LessonError(403, 'INVALID_ORIGIN'), 403, 'INVALID_ORIGIN'], [new Error('private database details'), 503, 'MATERIALS_UNAVAILABLE']]) {
    for (const response of [await http.materialResponse(async () => { throw error; }), await http.materialRedirect(async () => { throw error; })]) {
      assert.equal(response.status, status); assert.deepEqual(await response.json(), { error: code });
      assert.match(response.headers.get('cache-control'), /private, no-store/);
    }
  }
  const redirect = await http.materialRedirect(async () => 'https://storage.invalid/signed-get');
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), 'https://storage.invalid/signed-get');
  assert.match(redirect.headers.get('cache-control'), /no-store/);
  assert.equal(redirect.headers.get('referrer-policy'), 'no-referrer');
  const base = 'http://127.0.0.1:3000';
  await assert.rejects(http.mutationBody(new Request(base + '/api/admin/materials', { method: 'POST', headers: { origin: 'https://evil.invalid', 'content-type': 'application/json' }, body: '{}' }), base), e => e.status === 403);
});
