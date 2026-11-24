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
const rules = load('lib/admin/manual-access-rules.ts');
const { createAdminUsersReader } = load('lib/admin/users-core.ts', name => name === './manual-access-rules' ? rules : require(name));
const NONE_MANUAL = { status: 'none', startsAt: null, endsAt: null, firstDay: null, lastDay: null, updatedAt: null };
const NONE_PAID = { status: 'none', endsAt: null, lastDay: null };

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
    { id: 'u2', name: '  ', email: 'semnome@example.test', role: 'STUDENT', createdAt: new Date('2026-11-10T12:00:00Z'), updatedAt: new Date('2026-11-11T12:00:00Z'), disabledAt: new Date('2026-11-12T00:00:00Z'), isPrincipalAdmin: false, mustChangePassword: true, password: 'x' },
    { id: 'u1', name: ' Admin ', email: 'admin@example.test', role: 'ADMIN', createdAt: new Date('2026-11-01T12:00:00Z'), updatedAt: new Date('2026-11-01T12:00:00Z'), disabledAt: null, isPrincipalAdmin: true, mustChangePassword: false },
  ];
  const db = new Proxy({ user: { findMany: async args => { calls.push(args); return rows; } } }, {
    get(target, key) { if (key in target) return target[key]; assert.fail(`Unexpected db access: ${String(key)}`); },
  });
  const at = new Date('2026-11-20T12:00:00Z');
  const result = await createAdminUsersReader(db, async () => {}, () => at)();
  assert.deepEqual(calls, [{
    select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true, disabledAt: true, isPrincipalAdmin: true, mustChangePassword: true,
      // Manual grant: period and concurrency token only (never who granted). Paid: running subscriptions' dates and a count.
      manualAccessGrant: { select: { startsAt: true, endsAt: true, revokedAt: true, updatedAt: true } },
      subscriptions: { where: { status: 'active', endDate: { gt: at } }, select: { startDate: true, endDate: true } },
      _count: { select: { subscriptions: true } } },
    orderBy: { createdAt: 'desc' },
  }]);
  assert.deepEqual(result, { kind: 'ready', users: [
    { id: 'u2', name: null, email: 'semnome@example.test', role: 'student', createdAt: '2026-11-10T12:00:00.000Z', updatedAt: '2026-11-11T12:00:00.000Z', disabled: true, principal: false, mustChangePassword: true, paidAccess: NONE_PAID, manualAccess: NONE_MANUAL },
    { id: 'u1', name: 'Admin', email: 'admin@example.test', role: 'admin', createdAt: '2026-11-01T12:00:00.000Z', updatedAt: '2026-11-01T12:00:00.000Z', disabled: false, principal: true, mustChangePassword: false, paidAccess: NONE_PAID, manualAccess: NONE_MANUAL },
  ] });
  const failing = { user: { findMany: async () => { throw new Error('private database details'); } } };
  assert.deepEqual(await createAdminUsersReader(failing, async () => {})(), { kind: 'unavailable' });
});

test('admin users page guards before reading, renders real states and contains no fictional users', async () => {
  let allowed = true, reads = 0, data = { kind: 'unavailable' };
  let viewer = { id: 'viewer', name: null, email: '', isPrincipalAdmin: false };
  const Page = load('app/admin/usuarios/page.tsx', name => {
    if (name === '@/lib/auth/page-access') return { requirePageAccess: async role => { assert.equal(role, 'admin'); assert.equal(reads, readsAtGuard); if (!allowed) throw new Error('FORBIDDEN'); return { user: viewer }; } };
    if (name === '@/lib/admin/users') return { getAdminUsers: async () => { reads++; return data; } };
    if (name === '@/components/layout/AdminLayout') return { AdminLayout: ({ children }) => React.createElement('main', null, children) };
    if (name === '@/components/ui/card') return { Card: props => React.createElement('section', props) };
    if (name === '@/components/users/NewUserDialog') return { NewUserDialog: ({ canCreateAdmin }) => React.createElement('button', null, `Novo usuário admin=${canCreateAdmin}`) };
    if (name === '@/components/users/UserRoleControl') return { UserRoleControl: ({ user }) => React.createElement('button', null, `papel:${user.id}`) };
    if (name === '@/components/users/ManualAccessControl') return { ManualAccessControl: ({ user }) => React.createElement('button', null, `acesso:${user.id}`) };
    if (name === '@/lib/admin/manual-access-rules') return rules;
    if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
    return require(name);
  }).default;
  let readsAtGuard = 0;
  let html = renderToStaticMarkup(await Page());
  assert.match(html, /Lista indisponível no momento/);
  assert.doesNotMatch(html, /Total de usuários cadastrados|private database|Novo usuário/);

  readsAtGuard = 1; data = { kind: 'ready', users: [] };
  html = renderToStaticMarkup(await Page());
  assert.match(html, /Nenhum usuário cadastrado/);
  assert.match(html, />0</);

  readsAtGuard = 2; data = { kind: 'ready', users: [
    { id: 'a', name: 'Pessoa Admin', email: 'um-email-bem-longo-para-quebrar@example.test', role: 'admin', createdAt: '2026-11-10T02:00:00.000Z', disabled: false, principal: false, mustChangePassword: false },
    { id: 'b', name: null, email: 'zeta@example.test', role: 'student', createdAt: '2026-11-01T12:00:00.000Z', disabled: true, principal: false, mustChangePassword: false,
      paidAccess: { status: 'inactive', endsAt: null, lastDay: null }, manualAccess: { ...NONE_MANUAL, status: 'revoked', lastDay: '2026-11-30' } },
    { id: 'p', name: 'Principal', email: 'p@example.test', role: 'admin', createdAt: '2026-11-01T12:00:00.000Z', disabled: false, principal: true, mustChangePassword: false },
    { id: 'n', name: 'Nova', email: 'n@example.test', role: 'student', createdAt: '2026-11-01T12:00:00.000Z', disabled: false, principal: false, mustChangePassword: true,
      paidAccess: { status: 'active', endsAt: '2026-12-31T03:00:00.000Z', lastDay: '2026-12-30' },
      manualAccess: { status: 'active', startsAt: '2026-11-20T03:00:00.000Z', endsAt: '2026-12-20T03:00:00.000Z', firstDay: '2026-11-20', lastDay: '2026-12-19', updatedAt: '2026-11-20T12:00:00.000Z' } },
    { id: 'viewer', name: 'Eu', email: 'eu@example.test', role: 'admin', createdAt: '2026-11-01T12:00:00.000Z', disabled: false, principal: true, mustChangePassword: false },
  ] };
  html = renderToStaticMarkup(await Page());
  assert.match(html, />5</);
  assert.match(html, /Pessoa Admin/); assert.match(html, /Admin</); assert.match(html, /Aluno</);
  assert.match(html, /Sem nome/); assert.match(html, />z</); assert.match(html, /Desativado/);
  assert.match(html, /Admin principal/); assert.match(html, /Troca de senha pendente/);
  assert.match(html, /09\/11\/2026/); // America/Sao_Paulo, not UTC
  assert.match(html, /break-all/);
  assert.doesNotMatch(html, /Maria Silva|João Santos|Ana Costa|Ver detalhes/);
  // Common ADMIN: may create students only, no role controls at all.
  assert.match(html, /Novo usuário admin=false/);
  assert.doesNotMatch(html, /papel:/);
  // Students only: paid subscription and manual access shown separately, with manual access actions for any ADMIN.
  assert.match(html, /Assinatura paga: vigente até 30\/12\/2026/); assert.match(html, /Acesso manual: ativo até 19\/12\/2026/);
  assert.match(html, /Assinatura paga: sem assinatura vigente/); assert.match(html, /Acesso manual: revogado/);
  assert.deepEqual([...html.matchAll(/acesso:(\w+)/g)].map(match => match[1]), ['b', 'n']);
  assert.equal((html.match(/Assinatura paga:/g) ?? []).length, 2, 'administrators have no access summaries');

  readsAtGuard = 3; viewer = { id: 'viewer', name: 'Eu', email: 'eu@example.test', isPrincipalAdmin: true };
  html = renderToStaticMarkup(await Page());
  assert.match(html, /Novo usuário admin=true/);
  // Principal: controls on common accounts only; never on principal accounts, on itself or on disabled students.
  assert.deepEqual([...html.matchAll(/papel:(\w+)/g)].map(match => match[1]), ['a', 'n']);

  readsAtGuard = 4; allowed = false;
  await assert.rejects(Page(), /FORBIDDEN/);
  assert.equal(reads, 4);
});
