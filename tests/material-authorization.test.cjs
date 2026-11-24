// In-memory only: no PrismaClient, no database, no environment files, no network.
// Proves that non-admin identities (including a STUDENT with an active subscription) can never modify materials,
// both in the service and through the real route handlers, and covers the publication and cover rules.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function load(file, overrides = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8').replace('import "server-only";', ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name.startsWith('@/') || name.startsWith('./')) throw new Error(`Unexpected import: ${name}`);
    return require(name);
  }, module, module.exports);
  return module.exports;
}

const validation = load('lib/materials/validation.ts');
const storageModule = load('lib/storage/private-storage.ts');
const coverImage = load('lib/materials/cover-image.ts');
const core = load('lib/materials/service-core.ts', { './validation': validation, '@/lib/storage/private-storage': storageModule, './cover-image': coverImage });
const authCore = load('lib/auth/authorization-core.ts');
const lessonCore = load('lib/lessons/service-core.ts', { './validation': load('lib/lessons/validation.ts') });
const lessonHttp = load('lib/lessons/http.ts', { './service-core': lessonCore, '@/lib/auth/authorization-core': authCore });
const http = load('lib/materials/http.ts', {
  '@/lib/auth/authorization-core': authCore, '@/lib/lessons/service-core': lessonCore, '@/lib/lessons/http': lessonHttp,
  '@/lib/storage/private-storage': storageModule, './service-core': core, './cover-image': coverImage,
});
const catalog = require('../lib/materials/catalog.json');
const knownCovers = catalog.map(item => item.image);
const BASE = 'http://127.0.0.1:3000';
const NOW = new Date('2026-11-18T12:00:00Z');

const identities = {
  anonymous: { user: null, subscription: null, status: 401, code: 'UNAUTHENTICATED' },
  'STUDENT without subscription': { user: { role: 'STUDENT', disabledAt: null }, subscription: null, status: 403, code: 'FORBIDDEN' },
  'STUDENT with active subscription': { user: { role: 'STUDENT', disabledAt: null }, subscription: { id: 'sub', planId: 'p', startDate: new Date('2026-11-01'), endDate: new Date('2026-12-01') }, status: 403, code: 'FORBIDDEN' },
  'disabled ADMIN': { user: { role: 'ADMIN', disabledAt: new Date('2026-11-10') }, subscription: null, status: 403, code: 'FORBIDDEN' },
};

/** Real authorization logic over an in-memory auth layer (session + users + subscriptions only, never materials). */
function authFor(identity) {
  const auth = { api: { getSession: async () => identity.user ? { user: { id: 'u1' }, session: { id: 's1', expiresAt: new Date(NOW.getTime() + 3600000) } } : null } };
  const authDb = {
    user: { findUnique: async () => identity.user && { id: 'u1', name: null, email: 'u1@example.invalid', emailVerified: true, createdAt: NOW, ...identity.user } },
    subscription: { findFirst: async () => identity.subscription },
    // Manual access grants (requireActiveSubscription reads them only without a paid subscription).
    manualAccessGrant: { findFirst: async () => identity.grant ?? null },
  };
  return { auth, authDb, guards: authCore.createAuthorization(auth, authDb, async () => new Headers(), () => NOW) };
}
const failingDb = () => new Proxy({}, { get(_, key) { assert.fail(`Material data accessed: ${String(key)}`); } });
function recordingStorage() {
  const calls = [];
  const record = name => async () => { calls.push(name); assert.fail(`Storage accessed: ${name}`); };
  return { calls, configured: true, createUploadUrl: record('upload'), headObject: record('head'), readObject: record('read'), deleteObject: record('delete'), createDownloadUrl: record('download') };
}
const material = () => { const { id, status, ...data } = require('../scripts/material-catalog-import-plan.cjs').initialRecords()[0]; return data; };
const change = data => ({ expectedUpdatedAt: '2026-11-06T00:00:00.000Z', data });
const adminOperations = service => ({
  listAdmin: () => service.listAdmin(),
  getAdmin: () => service.getAdmin('material-initial-001'),
  create: () => service.create(material()),
  'change (edit price)': () => service.change('material-initial-001', change({ priceCents: 1 })),
  'change (publish)': () => service.change('material-initial-001', change({ status: 'PUBLISHED' })),
  'change (archive)': () => service.change('material-initial-001', change({ status: 'ARCHIVED' })),
  reorder: () => service.reorder({ order: ['material-initial-002', 'material-initial-001'] }),
  'pdf start': () => service.pdf('material-initial-001', { action: 'start', filename: 'guia.pdf', contentType: 'application/pdf', size: 10 }),
  'pdf confirm': () => service.pdf('material-initial-001', { action: 'confirm', assetId: 'asset-1' }),
  removePdf: () => service.removePdf('material-initial-001', { assetId: 'asset-1' }),
});

test('service: every admin operation rejects anonymous, STUDENT (with or without subscription) and disabled ADMIN before data or storage', async () => {
  for (const [label, identity] of Object.entries(identities)) {
    const storage = recordingStorage();
    const service = core.createMaterialService(failingDb(), authFor(identity).guards, storage, { knownCovers });
    for (const [operation, call] of Object.entries(adminOperations(service))) {
      await assert.rejects(call(), error => error instanceof authCore.AuthorizationError && error.status === identity.status && error.code === identity.code,
        `${label} / ${operation}`);
    }
    assert.deepEqual(storage.calls, [], label);
  }
});

test('service: a STUDENT with an active subscription can read the library (positive control)', async () => {
  const db = { material: { findMany: async args => { assert.deepEqual(args.where, { status: 'PUBLISHED' }); return [{ id: 'a', title: 'A', assets: [] }]; } } };
  const service = core.createMaterialService(db, authFor(identities['STUDENT with active subscription']).guards);
  assert.deepEqual(await service.listLibrary(), [{ id: 'a', title: 'A', hasPdf: false }]);
  await assert.rejects(core.createMaterialService(failingDb(), authFor(identities['STUDENT without subscription']).guards).listLibrary(),
    error => error.code === 'SUBSCRIPTION_REQUIRED');
});

/** Loads a real route handler with real authorization wiring (lib/auth/authorization.ts) and recorded side effects. */
function loadRoute(file, identity) {
  const { auth, authDb } = authFor(identity);
  const calls = { getMaterials: 0, readAuthEnvironment: 0, revalidate: 0 };
  const authorization = load('lib/auth/authorization.ts', {
    'next/headers': { headers: async () => new Headers() },
    './authorization-core': { ...authCore, createAuthorization: (a, d, h) => authCore.createAuthorization(a, d, h, () => NOW) },
    './server': { getAuthInfrastructure: () => ({ auth, db: authDb }) },
  });
  const route = load(file, {
    '@/lib/materials/server': { getMaterials: () => { calls.getMaterials++; return core.createMaterialService(failingDb(), authorization, recordingStorage(), { knownCovers }); } },
    '@/lib/materials/http': http,
    '@/lib/auth/config': { readAuthEnvironment: () => { calls.readAuthEnvironment++; return { baseURL: BASE }; } },
    '@/lib/auth/authorization': authorization,
    '@/lib/materials/revalidate': { revalidateMaterialPages: () => { calls.revalidate++; } },
  });
  return { route, calls };
}
/** Same-origin JSON request whose body records whether anything read it. */
function sameOriginRequest(url, method, body) {
  const state = { read: false };
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const stream = new ReadableStream({ pull(controller) { state.read = true; controller.enqueue(bytes); controller.close(); } },
    { highWaterMark: 0 }); // no eager pull: pull() runs only when a consumer actually reads
  const request = new Request(BASE + url, { method, duplex: 'half', body: stream,
    headers: { origin: BASE, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' } });
  return { request, state };
}
const params = id => ({ params: Promise.resolve({ id }) });
const mutations = [
  ['app/api/admin/materials/route.ts', 'POST', '/api/admin/materials', null, () => material()],
  ['app/api/admin/materials/[id]/route.ts', 'PATCH', '/api/admin/materials/material-initial-001', 'material-initial-001', () => change({ status: 'PUBLISHED' })],
  ['app/api/admin/materials/order/route.ts', 'PUT', '/api/admin/materials/order', null, () => ({ order: ['material-initial-001'] })],
  ['app/api/admin/materials/[id]/pdf/route.ts', 'POST', '/api/admin/materials/material-initial-001/pdf', 'material-initial-001', () => ({ action: 'start', filename: 'guia.pdf', contentType: 'application/pdf', size: 10 })],
  ['app/api/admin/materials/[id]/pdf/route.ts', 'DELETE', '/api/admin/materials/material-initial-001/pdf', 'material-initial-001', () => ({ assetId: 'asset-1' })],
];

test('routes: every admin mutation answers 401/403 to non-admins before reading the body, touching data or revalidating pages', async () => {
  for (const [label, identity] of Object.entries(identities)) {
    for (const [file, method, url, id, body] of mutations) {
      const { route, calls } = loadRoute(file, identity);
      const { request, state } = sameOriginRequest(url, method, body());
      const response = await route[method](request, id ? params(id) : undefined);
      const where = `${label} ${method} ${url}`;
      assert.equal(response.status, identity.status, where);
      assert.deepEqual(await response.json(), { error: identity.code }, where);
      assert.match(response.headers.get('cache-control'), /private, no-store/, where);
      assert.equal(state.read, false, `body read before authorization: ${where}`);
      assert.deepEqual(calls, { getMaterials: 0, readAuthEnvironment: 0, revalidate: 0 }, where);
    }
  }
});

test('routes: positive control — an active ADMIN passes the guard, so the body is read and the service is reached', async () => {
  const admin = { user: { role: 'ADMIN', disabledAt: null }, subscription: null };
  for (const [file, method, url, id, body] of mutations) {
    const { route, calls } = loadRoute(file, admin);
    const { request, state } = sameOriginRequest(url, method, body());
    await route[method](request, id ? params(id) : undefined);
    assert.equal(state.read, true, `${method} ${url}`);
    assert.equal(calls.readAuthEnvironment, 1);
    assert.equal(calls.getMaterials, 1);
  }
});

test('routes: admin reads (list and detail) also answer 401/403 to non-admins', async () => {
  for (const [label, identity] of Object.entries(identities)) {
    for (const [file, id] of [['app/api/admin/materials/route.ts', null], ['app/api/admin/materials/[id]/route.ts', 'material-initial-001']]) {
      const { route, calls } = loadRoute(file, identity);
      const response = await route.GET(new Request(BASE + '/api/admin/materials'), id ? params(id) : undefined);
      assert.equal(response.status, identity.status, `${label} GET ${file}`);
      assert.deepEqual(await response.json(), { error: identity.code });
      assert.equal(calls.getMaterials, 0);
    }
  }
});

const allow = { requireAdmin: async () => {}, requireActiveSubscription: async () => {} };
/** In-memory single material row for change(); updateMany honours the optimistic updatedAt check. */
function rowDb(row, { coverInUse = [] } = {}) {
  const state = { row: { ...row }, writes: 0 };
  const tx = { material: {
    findFirst: async ({ where }) => coverInUse.includes(where.coverImage) ? { id: 'other' } : null,
    updateMany: async ({ where, data }) => {
      if (where.id !== state.row.id || where.updatedAt.getTime() !== state.row.updatedAt.getTime()) return { count: 0 };
      state.pending = { ...state.row, ...data }; return { count: 1 };
    },
    findUniqueOrThrow: async () => state.pending,
  } };
  // Commits only when the callback resolves, like a real transaction.
  const db = { ...tx, $transaction: async fn => { const result = await fn(tx); state.row = state.pending; state.writes++; return result; } };
  return { db, state };
}
const seed = { id: 'material-initial-014', status: 'DRAFT', checkoutUrl: null, coverImage: catalog[13].image, updatedAt: new Date('2026-11-06T00:00:00.000Z') };

test('publication requires a checkout link, also when clearing the link of a published material', async () => {
  for (const empty of [null, '']) {
    const { db, state } = rowDb({ ...seed, checkoutUrl: empty });
    const service = core.createMaterialService(db, allow);
    await assert.rejects(service.change(seed.id, change({ status: 'PUBLISHED' })), e => e.status === 422 && e.code === 'MATERIAL_NOT_PUBLISHABLE');
    assert.equal(state.row.status, 'DRAFT'); assert.equal(state.writes, 0);
  }
  const link = 'https://go.hotmart.com/EXEMPLO';
  const { db, state } = rowDb(seed);
  const service = core.createMaterialService(db, allow);
  assert.equal((await service.change(seed.id, change({ status: 'PUBLISHED', checkoutUrl: link }))).status, 'PUBLISHED');
  state.row.updatedAt = new Date('2026-11-06T00:00:00.000Z');
  for (const checkoutUrl of [null, '']) {
    await assert.rejects(service.change(seed.id, change({ checkoutUrl })), e => e.status === 422 && e.code === 'MATERIAL_NOT_PUBLISHABLE');
    assert.equal(state.row.checkoutUrl, link, 'rejected change rolled back');
  }
  assert.equal((await service.change(seed.id, change({ status: 'DRAFT' }))).status, 'DRAFT');
  state.row.updatedAt = new Date('2026-11-06T00:00:00.000Z');
  assert.equal((await service.change(seed.id, change({ status: 'ARCHIVED' }))).status, 'ARCHIVED');
});

test('covers: only catalog images or covers already used by a material are accepted', async () => {
  const created = [];
  const db = { material: { findFirst: async ({ where }) => where.coverImage === '/em-uso.webp' ? { id: 'x' } : null, create: async ({ data }) => { created.push(data); return data; } } };
  const service = core.createMaterialService(db, allow, undefined, { knownCovers });
  await service.create({ ...material(), coverImage: catalog[3].image });
  await service.create({ ...material(), coverImage: '/em-uso.webp' });
  await assert.rejects(service.create({ ...material(), coverImage: '/nao-existe.webp' }), e => e.status === 400 && e.code === 'INVALID_COVER');
  assert.equal(created.length, 2);
  // Without a known list the service fails closed to covers already stored.
  await assert.rejects(core.createMaterialService(db, allow).create(material()), e => e.code === 'INVALID_COVER');

  const { db: changeDb, state } = rowDb(seed, { coverInUse: ['/em-uso.webp'] });
  const editing = core.createMaterialService(changeDb, allow, undefined, { knownCovers });
  await assert.rejects(editing.change(seed.id, change({ coverImage: '/nao-existe.webp' })), e => e.code === 'INVALID_COVER');
  assert.equal(state.writes, 0);
  assert.equal((await editing.change(seed.id, change({ coverImage: '/em-uso.webp' }))).coverImage, '/em-uso.webp');
});

test('change rejects malformed ids as not found before any transaction', async () => {
  const service = core.createMaterialService(failingDb(), allow);
  for (const id of ['../etc', 'a/b', '', 'x'.repeat(65)]) {
    await assert.rejects(service.change(id, change({ title: 'x' })), e => e.status === 404 && e.code === 'MATERIAL_NOT_FOUND');
  }
});

test('HTTP layer maps a Prisma unique violation to 409 without echoing details', async () => {
  const response = await http.materialResponse(async () => { throw Object.assign(new Error('Unique constraint failed on secret_column'), { code: 'P2002' }); });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'MATERIAL_CONFLICT' });
});
