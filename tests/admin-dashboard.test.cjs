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
const { createAdminDashboardReader } = load('lib/admin/dashboard-core.ts');

test('admin aggregates reject unauthorized callers before any database operation', async () => {
  for (const code of ['UNAUTHENTICATED', 'FORBIDDEN']) {
    const denied = new Error(code);
    const db = new Proxy({}, { get() { assert.fail('Database touched before authorization'); } });
    await assert.rejects(createAdminDashboardReader(db, async () => { throw denied; })(), e => e === denied);
  }
});

test('admin aggregate queries use one instant, active interval, inclusive seven-day boundary and published status', async () => {
  const queries = [];
  const count = model => args => { queries.push({ model, args }); return Promise.resolve(0); };
  const at = new Date('2026-11-06T12:00:00Z');
  const db = { user: { count: count('user') }, subscription: { count: count('subscription') }, lesson: { count: count('lesson') },
    $transaction: async (operations, options) => { assert.equal(options.isolationLevel, 'RepeatableRead'); return Promise.all(operations); } };
  const result = await createAdminDashboardReader(db, async () => {}, () => at)();
  assert.deepEqual(result, { kind: 'ready', students: 0, activeSubscriptions: 0, expiringSubscriptions: 0, lessons: 0, publishedLessons: 0, checkedAt: at.toISOString() });
  assert.deepEqual(queries, [
    { model: 'user', args: { where: { role: 'STUDENT' } } },
    { model: 'subscription', args: { where: { status: 'active', startDate: { lte: at }, endDate: { gt: at } } } },
    { model: 'subscription', args: { where: { status: 'active', startDate: { lte: at }, endDate: { gt: at, lte: new Date('2026-11-13T12:00:00Z') } } } },
    { model: 'lesson', args: undefined }, { model: 'lesson', args: { where: { status: 'PUBLISHED' } } },
  ]);
  db.$transaction = async () => { throw new Error('private database details'); };
  assert.deepEqual(await createAdminDashboardReader(db, async () => {})(), { kind: 'unavailable' });
});

test('admin page distinguishes unavailable from zero, contains no fictional activities, and guards before aggregates', async () => {
  let allowed = true, reads = 0, data = { kind: 'unavailable' };
  const Page = load('app/admin/dashboard/page.tsx', name => {
    if (name === '@/lib/auth/page-access') return { requirePageAccess: async role => { assert.equal(role, 'admin'); if (!allowed) throw new Error('FORBIDDEN'); return { user: { name: null, email: '' } }; } };
    if (name === '@/lib/admin/dashboard') return { getAdminDashboard: async () => { reads++; return data; } };
    if (name === '@/components/layout/AdminLayout') return { AdminLayout: ({ children }) => React.createElement('main', null, children) };
    if (name === '@/components/ui/card') return { Card: props => React.createElement('section', props) };
    if (name === 'next/link') return { __esModule: true, default: props => React.createElement('a', props) };
    if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
    return require(name);
  }).default;
  let html = renderToStaticMarkup(await Page());
  assert.match(html, /Indicadores indisponíveis/);
  assert.doesNotMatch(html, /Alunos cadastrados|private database/);
  data = { kind: 'ready', students: 0, activeSubscriptions: 0, expiringSubscriptions: 0, lessons: 0, publishedLessons: 0, checkedAt: new Date().toISOString() };
  html = renderToStaticMarkup(await Page());
  assert.match(html, /Alunos cadastrados/); assert.match(html, /0 publicadas/);
  assert.doesNotMatch(html, /156|89%|Maria Silva|João Santos|15 novos usuários|Taxa de engajamento/);
  allowed = false;
  await assert.rejects(Page(), /FORBIDDEN/);
  assert.equal(reads, 2);
});
