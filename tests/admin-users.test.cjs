const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
function load(file, imports = require) {
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace('import "server-only";', '');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', output)(imports, m, m.exports);
  return m.exports;
}
const { createAdminUsersReader } = load('lib/admin/users-core.ts');

test('admin users reader rejects unauthorized callers before any database operation', async () => {
  for (const code of ['UNAUTHENTICATED', 'FORBIDDEN']) {
    const denied = new Error(code);
    const db = new Proxy({}, { get() { assert.fail('Database touched before authorization'); } });
    await assert.rejects(createAdminUsersReader(db, async () => { throw denied; })(), e => e === denied);
  }
});

test('admin users reader runs one read-only query with whitelisted fields and maps rows', async () => {
  const calls = [];
  const rows = [
    { id: 'u2', name: '  ', email: 'semnome@example.test', role: 'STUDENT', createdAt: new Date('2026-11-10T12:00:00Z'), disabledAt: new Date('2026-11-12T00:00:00Z'), password: 'x' },
    { id: 'u1', name: ' Admin ', email: 'admin@example.test', role: 'ADMIN', createdAt: new Date('2026-11-01T12:00:00Z'), disabledAt: null },
  ];
  const db = new Proxy({ user: { findMany: async args => { calls.push(args); return rows; } } }, {
    get(target, key) { if (key in target) return target[key]; assert.fail(`Unexpected db access: ${String(key)}`); },
  });
  const result = await createAdminUsersReader(db, async () => {})();
  assert.deepEqual(calls, [{
    select: { id: true, name: true, email: true, role: true, createdAt: true, disabledAt: true },
    orderBy: { createdAt: 'desc' },
  }]);
  assert.deepEqual(result, { kind: 'ready', users: [
    { id: 'u2', name: null, email: 'semnome@example.test', role: 'student', createdAt: '2026-11-10T12:00:00.000Z', disabled: true },
    { id: 'u1', name: 'Admin', email: 'admin@example.test', role: 'admin', createdAt: '2026-11-01T12:00:00.000Z', disabled: false },
  ] });
  const failing = { user: { findMany: async () => { throw new Error('private database details'); } } };
  assert.deepEqual(await createAdminUsersReader(failing, async () => {})(), { kind: 'unavailable' });
});

test('admin users page guards before reading, renders real states and contains no fictional users', async () => {
  let allowed = true, reads = 0, data = { kind: 'unavailable' };
  const Page = load('app/admin/usuarios/page.tsx', name => {
    if (name === '@/lib/auth/page-access') return { requirePageAccess: async role => { assert.equal(role, 'admin'); assert.equal(reads, readsAtGuard); if (!allowed) throw new Error('FORBIDDEN'); return { user: { name: null, email: '' } }; } };
    if (name === '@/lib/admin/users') return { getAdminUsers: async () => { reads++; return data; } };
    if (name === '@/components/layout/AdminLayout') return { AdminLayout: ({ children }) => React.createElement('main', null, children) };
    if (name === '@/components/ui/card') return { Card: props => React.createElement('section', props) };
    if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
    return require(name);
  }).default;
  let readsAtGuard = 0;
  let html = renderToStaticMarkup(await Page());
  assert.match(html, /Lista indisponível no momento/);
  assert.doesNotMatch(html, /Total de usuários cadastrados|private database/);

  readsAtGuard = 1; data = { kind: 'ready', users: [] };
  html = renderToStaticMarkup(await Page());
  assert.match(html, /Nenhum usuário cadastrado/);
  assert.match(html, />0</);

  readsAtGuard = 2; data = { kind: 'ready', users: [
    { id: 'a', name: 'Pessoa Admin', email: 'um-email-bem-longo-para-quebrar@example.test', role: 'admin', createdAt: '2026-11-10T02:00:00.000Z', disabled: false },
    { id: 'b', name: null, email: 'zeta@example.test', role: 'student', createdAt: '2026-11-01T12:00:00.000Z', disabled: true },
  ] };
  html = renderToStaticMarkup(await Page());
  assert.match(html, />2</);
  assert.match(html, /Pessoa Admin/); assert.match(html, /Admin</); assert.match(html, /Aluno</);
  assert.match(html, /Sem nome/); assert.match(html, />z</); assert.match(html, /Desativado/);
  assert.match(html, /09\/11\/2026/); // America/Sao_Paulo, not UTC
  assert.match(html, /break-all/);
  assert.doesNotMatch(html, /Maria Silva|João Santos|Ana Costa|Ver detalhes/);

  readsAtGuard = 3; allowed = false;
  await assert.rejects(Page(), /FORBIDDEN/);
  assert.equal(reads, 3);
});
