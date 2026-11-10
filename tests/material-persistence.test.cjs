const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, imports = require) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(file), 'utf8').replace('import "server-only";', ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} }; new Function('require','module','exports',code)(imports,module,module.exports); return module.exports;
}
const validation = load('lib/materials/validation.ts');
const { createMaterialService } = load('lib/materials/service-core.ts', name => name === './validation' ? validation : require(name));
const { createAuthorization } = load('lib/auth/authorization-core.ts');
const input = () => { const { id, status, ...data } = require('../scripts/material-catalog-import-plan.cjs').initialRecords()[0]; return data; };

test('all administrative service operations reject anonymous, STUDENT and disabled ADMIN before data access', async () => {
  for (const identity of [null, { role: 'STUDENT', disabledAt: null }, { role: 'ADMIN', disabledAt: new Date() }]) {
    const guards = createAuthorization({ api: { getSession: async () => identity ? { user: { id: 'test' }, session: { expiresAt: new Date(Date.now()+60000) } } : null } }, {
      user: { findUnique: async () => ({ id: 'test', ...identity }) },
    }, async () => new Headers());
    const db = new Proxy({}, { get() { assert.fail('Unauthorized database access'); } });
    const service = createMaterialService(db, guards.requireAdmin);
    await assert.rejects(service.listAdmin()); await assert.rejects(service.create(input()));
    await assert.rejects(service.change('test', {}));
  }
});
test('ADMIN creation stays DRAFT and rejects injected IDs, roles, assets and invalid commercial data', async () => {
  let writes = 0;
  const service = createMaterialService({ material: { create: async ({ data }) => { writes++; return data; } } }, async () => {});
  assert.equal((await service.create(input())).status, 'DRAFT');
  for (const patch of [{ id: 'injected' }, { role: 'ADMIN' }, { assets: [] }, { status: 'PUBLISHED' }, { priceCents: -1 }, { checkoutUrl: 'javascript:alert(1)' }, { coverImage: '/../secret.png' }]) {
    await assert.rejects(service.create({ ...input(), ...patch }), e => e.status === 400);
  }
  assert.equal(writes, 1);
  for (const { id, status, ...data } of require('../scripts/material-catalog-import-plan.cjs').initialRecords()) assert.deepEqual(validation.materialInput.parse(data), data);
});
test('stale administrative edits fail with 409 and archive is a status change', async () => {
  let count = 0, received;
  const tx = { material: { updateMany: async args => { received = args; return { count }; }, findUniqueOrThrow: async () => ({ status: 'ARCHIVED' }) } };
  const service = createMaterialService({ $transaction: fn => fn(tx) }, async () => {});
  const input = { expectedUpdatedAt: '2026-11-06T00:00:00.000Z', data: { status: 'ARCHIVED' } };
  await assert.rejects(service.change('test', input), e => e.status === 409);
  count = 1; assert.equal((await service.change('test', input)).status, 'ARCHIVED');
  assert.deepEqual(received.where, { id: 'test', updatedAt: new Date(input.expectedUpdatedAt) });
  assert.deepEqual(received.data, { status: 'ARCHIVED' });
});
