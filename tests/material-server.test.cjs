// In-memory only: no PrismaClient, no database, no environment files.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function load(file, imports) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8').replace('import "server-only";', ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(imports, module, module.exports);
  return module.exports;
}
const validation = load('lib/materials/validation.ts', require);
const storage = load('lib/storage/private-storage.ts', require);
const core = load('lib/materials/service-core.ts', name => name === './validation' ? validation : name === '@/lib/storage/private-storage' ? storage : require(name));
const { createAuthorization, AuthorizationError } = load('lib/auth/authorization-core.ts', require);
const input = () => {
  const { id, status, ...data } = require('../scripts/material-catalog-import-plan.cjs').initialRecords()[0];
  return data;
};

/** Loads lib/materials/server.ts with recorded, injectable dependencies. */
function loadServer({ db, requireAdmin, requireActiveSubscription = requireAdmin, log = [] }) {
  const calls = { infrastructure: 0 };
  const imports = name => {
    if (name === '@/lib/auth/server') return { getAuthInfrastructure: () => { calls.infrastructure++; log.push('infrastructure'); return { db, auth: {} }; } };
    if (name === '@/lib/auth/authorization') return { requireAdmin, requireActiveSubscription };
    if (name === '@/lib/storage/server') return { getPrivateStorage: () => storage.unconfiguredStorage };
    if (name === './service-core') return core;
    throw new Error(`Unexpected import: ${name}`); // e.g. @prisma/client: no second pool
  };
  return { server: load('lib/materials/server.ts', imports), calls };
}
const failingDb = () => new Proxy({}, { get(_, key) { assert.fail(`Database accessed: ${String(key)}`); } });
async function withFlag(value, fn) {
  const previous = process.env.MATERIALS_PERSISTENCE;
  if (value === undefined) delete process.env.MATERIALS_PERSISTENCE; else process.env.MATERIALS_PERSISTENCE = value;
  try { return await fn(); }
  finally { if (previous === undefined) delete process.env.MATERIALS_PERSISTENCE; else process.env.MATERIALS_PERSISTENCE = previous; }
}

test('without the explicit opt-in the factory fails closed before infrastructure or authorization', async () => {
  for (const value of [undefined, '', 'true', '1', 'ENABLED', ' enabled']) {
    let guarded = 0;
    const { server, calls } = loadServer({ db: failingDb(), requireAdmin: async () => { guarded++; } });
    await withFlag(value, () => assert.throws(() => server.getMaterials(),
      error => error instanceof core.MaterialError && error.status === 503 && error.code === 'MATERIALS_PERSISTENCE_DISABLED'));
    assert.equal(calls.infrastructure, 0, `infrastructure touched for ${JSON.stringify(value)}`);
    assert.equal(guarded, 0);
  }
  assert.throws(() => loadServer({ db: failingDb(), requireAdmin: async () => {} }).server.assertMaterialsEnabled({}), /MATERIALS_PERSISTENCE_DISABLED/);
  assert.doesNotThrow(() => loadServer({ db: failingDb(), requireAdmin: async () => {} }).server.assertMaterialsEnabled({ MATERIALS_PERSISTENCE: 'enabled' }));
});

test('enabled factory reuses the shared Prisma client and the injected ADMIN guard', async () => {
  const shared = { material: { findMany: async () => ['shared-pool'] } };
  let guarded = 0;
  const { server, calls } = loadServer({ db: shared, requireAdmin: async () => { guarded++; } });
  const result = await withFlag('enabled', () => server.getMaterials().listAdmin());
  assert.deepEqual(result, ['shared-pool']);
  assert.equal(calls.infrastructure, 1);
  assert.equal(guarded, 1);
});

test('anonymous, STUDENT and disabled ADMIN are rejected before any database access', async () => {
  for (const identity of [null, { role: 'STUDENT', disabledAt: null }, { role: 'ADMIN', disabledAt: new Date() }]) {
    // Real authorization logic; its own user lookup is the auth layer, separate from material data.
    const guards = createAuthorization({ api: { getSession: async () => identity
      ? { user: { id: 'test' }, session: { id: 's', expiresAt: new Date(Date.now() + 60000) } } : null } },
      { user: { findUnique: async () => ({ id: 'test', name: null, email: 't@example.invalid', emailVerified: true, createdAt: new Date(), ...identity }) } },
      async () => new Headers());
    const { server } = loadServer({ db: failingDb(), requireAdmin: guards.requireAdmin });
    await withFlag('enabled', async () => {
      const service = server.getMaterials();
      for (const operation of [() => service.listAdmin(), () => service.create(input()),
        () => service.change('material-initial-001', { expectedUpdatedAt: '2026-11-06T00:00:00.000Z', data: { status: 'ARCHIVED' } })]) {
        await assert.rejects(operation(), error => error instanceof AuthorizationError && [401, 403].includes(error.status));
      }
    });
  }
});

test('accepted ADMIN: authorization completes before the first material query', async () => {
  const log = [];
  const record = name => async (...args) => { log.push(name); return name === 'updateMany' ? { count: 1 } : {}; };
  const tx = { material: { updateMany: record('updateMany'), findUniqueOrThrow: record('findUniqueOrThrow') } };
  const db = { material: { findMany: record('findMany'), create: record('create') }, $transaction: async fn => { log.push('$transaction'); return fn(tx); } };
  const { server } = loadServer({ db, log, requireAdmin: async () => { await Promise.resolve(); log.push('requireAdmin'); } });
  await withFlag('enabled', async () => {
    const service = server.getMaterials();
    for (const [operation, first] of [[() => service.listAdmin(), 'findMany'], [() => service.create(input()), 'create'],
      [() => service.change('material-initial-001', { expectedUpdatedAt: '2026-11-06T00:00:00.000Z', data: { title: 'x' } }), '$transaction']]) {
      log.length = 0;
      await operation();
      assert.deepEqual(log.slice(0, 2), ['requireAdmin', first]);
    }
  });
});

test('server factory has no private pool, raw queries or hardcoded database identities', () => {
  const source = fs.readFileSync(path.join(root, 'lib/materials/server.ts'), 'utf8');
  for (const forbidden of ['new PrismaClient', '@prisma/client', '$queryRaw', 'compartilhar_auth_test', '127.0.0.1', '5432', 'DATABASE_URL']) {
    assert.ok(!source.includes(forbidden), `server.ts must not contain ${forbidden}`);
  }
  assert.match(source, /getAuthInfrastructure\(\)\.db/);
});

test('only the validated local launcher enables material persistence', () => {
  const { isolatedEnvironment } = require('../scripts/local-auth-admin.cjs');
  const target = 'postgresql://compartilhar_auth_test_user:synthetic@127.0.0.1:5432/compartilhar_auth_test';
  assert.equal(isolatedEnvironment(target).MATERIALS_PERSISTENCE, 'enabled');
  assert.throws(() => isolatedEnvironment(target.replace('127.0.0.1', 'remote.invalid')), /AUTH_TEST_TARGET_REJECTED/);
});
