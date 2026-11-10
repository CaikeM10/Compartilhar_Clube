const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');

function load(file, imports = require) {
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace('import "server-only";', '');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(imports, module, module.exports);
  return module.exports;
}
const { createStudentSubscriptionReader } = load('lib/student/subscription-core.ts');
const at = new Date('2026-11-06T12:00:00Z');
const record = (overrides = {}) => ({ status: 'active', startDate: new Date('2026-11-01T12:00:00Z'),
  endDate: new Date('2026-12-01T12:00:00Z'), plan: { name: 'mensal' }, ...overrides });

test('subscription read binds every query to the session, prefers active period, projects only safe fields', async () => {
  const calls = [];
  const read = createStudentSubscriptionReader({ subscription: { findFirst: async args => { calls.push(args); return record(); } } },
    async () => ({ user: { id: 'own-user' } }), () => at);
  const result = await read('attacker-supplied-user');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].where, { userId: 'own-user', status: 'active', startDate: { lte: at }, endDate: { gt: at } });
  assert.deepEqual(Object.keys(result).sort(), ['expiresAt', 'kind', 'plan', 'startsAt', 'status']);
  assert.equal(result.status, 'active'); assert.equal(result.plan, 'Plano mensal');
});

test('missing, expired at boundary, future and inactive states never claim active access', async () => {
  for (const [row, expected] of [[null, 'none'], [record({ endDate: at }), 'expired'],
    [record({ startDate: new Date(at.getTime() + 1000) }), 'scheduled'],
    [record({ status: 'canceled' }), 'inactive']]) {
    let count = 0;
    const read = createStudentSubscriptionReader({ subscription: { findFirst: async args => {
      assert.equal(args.where.userId, 'own-user'); return ++count === 1 ? null : row;
    } } }, async () => ({ user: { id: 'own-user' } }), () => at);
    const result = await read();
    assert.equal(result.kind === 'subscription' ? result.status : result.kind, expected);
    assert.equal(count, 2);
  }
});

test('authentication fails closed; database failure is unavailable, never no-subscription', async () => {
  const denied = new Error('UNAUTHENTICATED');
  await assert.rejects(createStudentSubscriptionReader({ subscription: { findFirst: () => assert.fail('must not query') } },
    async () => { throw denied; })(), error => error === denied);
  assert.deepEqual(await createStudentSubscriptionReader({ subscription: { findFirst: async () => { throw new Error('private driver details'); } } },
    async () => ({ user: { id: 'own' } }))(), { kind: 'unavailable' });
});

function viewImports(extra = {}) {
  return name => {
    if (name in extra) return extra[name];
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'next/link') return { __esModule: true, default: props => React.createElement('a', props) };
    if (name === '@/components/ui/card') return { Card: props => React.createElement('section', props) };
    if (name === '@/components/ui/button') return { Button: ({ asChild, children, ...props }) => asChild ? children : React.createElement('button', props, children) };
    if (name === '@/components/layout/MemberLayout') return { MemberLayout: ({ children }) => React.createElement('main', null, children) };
    if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
    throw new Error('UNEXPECTED_IMPORT');
  };
}

test('dashboard renders session name, honest empty states, shared materials catalog and same responsive grids', async () => {
  const { SubscriptionSummary } = load('components/student/SubscriptionSummary.tsx', viewImports());
  const Page = load('app/aluno/dashboard/page.tsx', viewImports({
    '@/components/student/SubscriptionSummary': { SubscriptionSummary },
    '@/lib/auth/page-access': { requirePageAccess: async access => { assert.equal(access, 'account'); return { user: { name: 'Aluna <Teste>', email: 'synthetic@example.invalid' } }; } },
    '@/lib/student/subscription': { getStudentSubscription: async () => ({ kind: 'none' }) },
  })).default;
  const html = renderToStaticMarkup(await Page());
  assert.match(html, /Aluna &lt;Teste&gt;/);
  assert.match(html, /Você ainda não tem uma assinatura vigente/);
  assert.match(html, /href="\/materiais"/);
  assert.match(html, /sem pagar novamente/);
  assert.match(html, /Explorar Biblioteca de Materiais/);
  assert.doesNotMatch(html, /compra separada da assinatura|Ver materiais avulsos/);
  assert.doesNotMatch(html, />24<|120\+|>8<|15\/01\/2026|15 novos|\+3 novas|Desenvolvimento Cognitivo/);
  assert.doesNotMatch(html, /Aguardando aula em destaque|Aula em destaque/);
  assert.match(html, /md:grid-cols-3/); assert.match(html, /lg:grid-cols-3/);
  for (const status of ['active', 'expired', 'scheduled', 'inactive']) {
    const rendered = renderToStaticMarkup(React.createElement(SubscriptionSummary, { subscription: {
      kind: 'subscription', plan: 'Plano teste', status, startsAt: at.toISOString(), expiresAt: '2026-12-01T12:00:00Z',
    } }));
    assert.match(rendered, /01\/12\/2026/);
    assert.match(rendered, /09:00/);
  }
  const unavailable = renderToStaticMarkup(React.createElement(SubscriptionSummary, { subscription: { kind: 'unavailable' } }));
  assert.match(unavailable, /Tentar novamente/); assert.doesNotMatch(unavailable, /não tem uma assinatura/);
});

test('real authorized local PostgreSQL keeps both student accounts isolated and preserves existing records', async () => {
  const { PrismaClient } = require('@prisma/client');
  const { loadTarget, verifyServer } = require('../scripts/auth-test-safety.cjs');
  const { createStudent } = require('../scripts/local-auth-student.cjs');
  const { loadAuthFactory } = require('../scripts/local-auth-admin.cjs');
  const { createAuthorization } = load('lib/auth/authorization-core.ts');
  const db = new PrismaClient({ datasources: { db: { url: loadTarget(root) } }, log: [] });
  const fixtures = [];
  let before;
  const digest = async () => createHash('sha256').update(JSON.stringify(await Promise.all(
    ['user', 'account', 'session', 'plan', 'subscription', 'payment', 'verification'].map(model => db[model].findMany({ orderBy: { id: 'asc' } })),
  ))).digest('hex');
  try {
    await verifyServer(db); before = await digest();
    const factory = await loadAuthFactory();
    const email = `dashboard-${randomBytes(12).toString('hex')}@example.invalid`;
    const password = randomBytes(32).toString('base64url');
    fixtures.push(await createStudent(db, factory, email, password));
    fixtures.push(await createStudent(db, factory, `other-${email}`, randomBytes(32).toString('base64url')));
    await db.plan.update({ where: { id: fixtures[1].planId }, data: { name: `OTHER_PRIVATE_${randomBytes(8).toString('hex')}` } });
    await db.subscription.update({ where: { id: fixtures[1].subscriptionId }, data: { endDate: new Date(Date.now() + 90 * 86400000) } });
    const auth = factory(db, { secret: randomBytes(48).toString('base64url'), baseURL: 'http://127.0.0.1:3000', secureCookies: false });
    const response = await auth.handler(new Request('http://127.0.0.1:3000/api/auth/sign-in/email', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3000' }, body: JSON.stringify({ email, password }),
    }));
    assert.equal(response.status, 200);
    const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const access = createAuthorization(auth, db, async () => new Headers({ cookie }));
    const read = createStudentSubscriptionReader(db, access.requireSession);
    const active = await read(fixtures[1].userId);
    assert.equal(active.status, 'active');
    assert.equal(active.plan, 'Plano de teste local — 30 dias');
    assert.equal(active.expiresAt, fixtures[0].endDate.toISOString());
    await assert.rejects(access.requireAdmin(), error => error.status === 403);
    await db.subscription.update({ where: { id: fixtures[0].subscriptionId }, data: { endDate: new Date(Date.now() - 1000) } });
    assert.equal((await read()).status, 'expired');
    await assert.rejects(access.requireActiveSubscription(), error => error.code === 'SUBSCRIPTION_REQUIRED');
    await db.subscription.delete({ where: { id: fixtures[0].subscriptionId } });
    assert.deepEqual(await read(), { kind: 'none' });
  } catch { throw new Error('LOCAL_DASHBOARD_TEST_FAILED_REDACTED'); }
  finally {
    try {
      for (const fixture of fixtures) await db.$transaction(async tx => {
        await verifyServer(tx);
        await tx.subscription.deleteMany({ where: { id: fixture.subscriptionId, userId: fixture.userId } });
        await tx.session.deleteMany({ where: { userId: fixture.userId } });
        await tx.account.deleteMany({ where: { userId: fixture.userId } });
        await tx.user.delete({ where: { id: fixture.userId } });
        await tx.plan.delete({ where: { id: fixture.planId } });
      });
      if (before) assert.equal(await digest(), before, 'Existing records changed');
    } finally { await db.$disconnect(); }
  }
});
