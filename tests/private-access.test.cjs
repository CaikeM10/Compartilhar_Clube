const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
const { redirect, getURLFromRedirectError } = require('next/dist/client/components/redirect');
const { isRedirectError } = require('next/dist/client/components/redirect-error');
const { validateTarget, verifyServer } = require('../scripts/auth-test-safety.cjs');
const root = path.resolve(__dirname, '..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs/private-access/before.json'), 'utf8'));
const pages = Object.keys(baseline.pages);
const exclusive = ['aulas', 'recursos', 'supervisoes', 'solicitar-supervisao'];
const expectedAccess = file => file.startsWith('app/admin/') ? 'admin' : exclusive.includes(file.split('/')[2]) ? 'subscriber' : 'account';

// Execute the actual page function. Only visual imports are replaced: React JSX
// is real; authorization, Better Auth, PostgreSQL and Next redirect are real.
function loadPage(file, requirePageAccess) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  const visual = new Proxy({}, { get: (_, name) => name === '__esModule' ? true : () => null });
  const imports = name => {
    if (name === '@/lib/auth/page-access') return { requirePageAccess };
    // Dashboard now reads the own-account subscription after the page guard.
    // Query isolation and real Prisma behavior have dedicated dashboard tests.
    if (name === '@/lib/student/subscription') return { getStudentSubscription: async () => ({ kind: 'none' }) };
    if (name === '@/lib/admin/dashboard') return { getAdminDashboard: async () => ({ kind: 'unavailable' }) };
    if (name === '@/lib/materials/catalog') return { materials: require('../lib/materials/catalog.json') };
    if (name === '@/lib/lessons/server') return { getLessons: () => ({ listAdmin: async () => [], listPublished: async () => [] }) };
    if (name === 'react/jsx-runtime') return require(name);
    if (name.startsWith('@/components/') || name === 'lucide-react' || name === 'next/link') return visual;
    throw new Error('UNEXPECTED_PAGE_IMPORT');
  };
  new Function('require', 'module', 'exports', compiled)(imports, module, module.exports);
  return module.exports.default;
}

test('every private page has server authorization before rendering; visual markup and restricted files preserved', () => {
  const discovered = ['admin', 'aluno'].flatMap(area => fs.readdirSync(path.join(root, 'app', area), { withFileTypes: true })
    .filter(item => item.isDirectory() && fs.existsSync(path.join(root, 'app', area, item.name, 'page.tsx')))
    .map(item => `app/${area}/${item.name}/page.tsx`));
  assert.deepEqual(discovered.sort(), [...pages].sort());
  for (const file of pages) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /["']use client["']|ProtectedRoute|useAuth/);
    assert.ok(source.includes(`await requirePageAccess("${expectedAccess(file)}")`));
    assert.ok(source.indexOf('await requirePageAccess') < source.indexOf('return '));
    const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let expression;
    function visit(node) { if (ts.isReturnStatement(node) && node.expression && !expression) expression = node.expression.getText(ast); ts.forEachChild(node, visit); }
    visit(ast);
    const normalized = expression.replace(/<>|<\/>/g, '').replace(/ viewer=\{user\}/g, '').replace(/\s+/g, ' ').trim();
    // Explicitly authorized dashboard data replacement; all other pages stay frozen.
    if (['app/admin/aulas/page.tsx', 'app/aluno/aulas/page.tsx'].includes(file)) {
      assert.match(source, /getLessons\(\)/);
    } else if (['app/admin/recursos/page.tsx', 'app/aluno/recursos/page.tsx'].includes(file)) {
      assert.match(source, /@\/lib\/materials\/catalog/);
      assert.doesNotMatch(source, /fileUrl|const recursos|const materials/);
    } else if (file === 'app/admin/dashboard/page.tsx') {
      assert.match(source, /getAdminDashboard\(\)/);
      assert.doesNotMatch(source, />156<|>24<|>120<|89%/);
      assert.match(source, /sm:grid-cols-2 xl:grid-cols-4/);
    } else if (file !== 'app/aluno/dashboard/page.tsx') {
      assert.equal(normalized, baseline.pages[file].jsx, `Visual markup changed: ${file}`);
    } else {
      for (const layout of ['space-y-6', 'grid md:grid-cols-3 gap-4', 'grid md:grid-cols-2 lg:grid-cols-3 gap-4']) {
        assert.ok(source.includes(layout), `Dashboard responsive structure missing: ${layout}`);
      }
      assert.match(source, /getStudentSubscription\(\)/);
    }
  }
  for (const [file, hash] of Object.entries(baseline.unchanged)) {
    // The following files are now explicitly authorized for real login integration.
    // Their visual/security contracts are covered by real-login.test.cjs instead.
    if (['app/login/page.tsx', 'contexts/AuthContext.tsx'].includes(file)) continue;
    // Explicit catalog extraction; exact commercial values and markup checked separately.
    if (['app/materiais/page.tsx', 'components/materials/MaterialsCarousel.tsx', 'components/library/MaterialLibraryCard.tsx'].includes(file)) continue;
    if (file === 'prisma/schema.prisma') {
      // Only the additive Lesson schema is authorized; strip it and compare the original hash.
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      const restored = source.replace(/enum LessonStatus \{[^}]+\}\r?\n\r?\nmodel Lesson \{[^}]+\}\r?\n\r?\n/, '');
      assert.equal(createHash('sha256').update(restored).digest('hex'), hash, 'Existing Prisma schema changed');
      continue;
    }
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'), hash, `Restricted file changed: ${file}`);
  }
});

test('private page entry points and direct auth API with isolated PostgreSQL', async t => {
  const url = validateTarget(process.env.TEST_DATABASE_URL);
  const { PrismaClient } = require(process.env.AUTH_TEST_CLIENT);
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  const ids = [];
  let verified = false, planId;
  const scenario = (name, fn) => t.test(name, async () => {
    try { await fn(); } catch (error) { throw new Error(`Scenario failed: ${name}; code=${/^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'REDACTED'}`); }
  });
  try {
    await verifyServer(db); verified = true;
    const load = name => import(pathToFileURL(path.join(process.env.AUTH_SERVER_TEST_MODULES, `${name}.mjs`)).href);
    const { createServerAuth, readAuthEnvironment } = await load('config');
    const { createAuthorization } = await load('authorization-core');
    const { createPageAccess } = await load('page-access-core');
    const { handleAuthRequest } = await load('http');
    const auth = createServerAuth(db, readAuthEnvironment({
      BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'), BETTER_AUTH_URL: 'http://127.0.0.1:3000', NODE_ENV: 'test',
    }));
    const password = randomBytes(32).toString('base64url');
    const api = async (endpoint, body, cookie) => {
      const response = await handleAuthRequest(new Request(`http://127.0.0.1:3000/api/auth/${endpoint}`, {
        method: body ? 'POST' : 'GET',
        headers: { origin: 'http://127.0.0.1:3000', ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }), () => auth);
      const text = await response.text();
      return { status: response.status, data: text ? JSON.parse(text) : null,
        cookie: response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') };
    };
    const register = async email => {
      const result = await api('sign-up/email', { name: 'Synthetic Page User', email, password });
      assert.equal(result.status, 200); ids.push(result.data.user.id);
      return { ...result, id: result.data.user.id, email };
    };
    const student = await register('private-student@example.invalid');
    const admin = await register('private-admin-fixture@example.invalid');
    await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    const guard = cookie => createPageAccess(createAuthorization(auth, db, async () => new Headers({ cookie: cookie || '' })), redirect);
    const render = (file, cookie) => loadPage(file, guard(cookie))();
    const redirects = (fn, destination) => assert.rejects(fn, error => isRedirectError(error) && getURLFromRedirectError(error) === destination);
    const adminPages = pages.filter(p => expectedAccess(p) === 'admin');
    const accountPages = pages.filter(p => expectedAccess(p) === 'account');
    const subscriberPages = pages.filter(p => expectedAccess(p) === 'subscriber');

    await scenario('all 12 actual page functions redirect anonymous visitors before returning JSX', async () => {
      for (const file of pages) await redirects(() => render(file), '/login');
    });
    await scenario('student cannot render any admin page; administrator can render all five', async () => {
      for (const file of adminPages) {
        await redirects(() => render(file, student.cookie), '/login?reason=access-denied');
        assert.ok(await render(file, admin.cookie));
      }
    });
    await scenario('account and feedback pages allow a real student session without subscription', async () => {
      for (const file of accountPages) assert.ok(await render(file, student.cookie));
    });
    await scenario('missing, future and expired subscriptions redirect all exclusive pages without locking account access', async () => {
      planId = (await db.plan.create({ data: { name: 'PRIVATE_ACCESS_SYNTHETIC_PLAN', duration: 1, price: 1 } })).id;
      const now = Date.now();
      for (const state of ['missing', 'future', 'expired']) {
        let subscription;
        if (state !== 'missing') subscription = await db.subscription.create({ data: {
          userId: student.id, planId, status: 'active',
          startDate: new Date(now + (state === 'future' ? 60000 : -120000)),
          endDate: new Date(now + (state === 'future' ? 120000 : -60000)),
        } });
        for (const file of subscriberPages) await redirects(() => render(file, student.cookie), '/aluno/dashboard?access=subscription-required');
        assert.ok(await render('app/aluno/dashboard/page.tsx', student.cookie));
        if (subscription) await db.subscription.delete({ where: { id: subscription.id } });
      }
    });
    await scenario('active subscription authorizes all four exclusive page functions', async () => {
      await db.subscription.create({ data: { userId: student.id, planId, status: 'active', startDate: new Date(Date.now() - 1000), endDate: new Date(Date.now() + 60000) } });
      for (const file of subscriberPages) assert.ok(await render(file, student.cookie));
    });
    await scenario('blocked account with previously valid session cannot render account or exclusive pages', async () => {
      await db.user.update({ where: { id: student.id }, data: { disabledAt: new Date() } });
      for (const file of [...accountPages, ...subscriberPages]) await redirects(() => render(file, student.cookie), '/login?reason=access-denied');
      await db.user.update({ where: { id: student.id }, data: { disabledAt: null } });
      await db.user.update({ where: { id: admin.id }, data: { disabledAt: new Date() } });
      for (const file of adminPages) await redirects(() => render(file, admin.cookie), '/login?reason=access-denied');
      await db.user.update({ where: { id: admin.id }, data: { disabledAt: null } });
    });
    await scenario('segment layouts have independent guards and return no markup of their own', async () => {
      for (const [file, cookie] of [['app/admin/layout.tsx', admin.cookie], ['app/aluno/layout.tsx', student.cookie]]) {
        const execute = cookie => loadPage(file, guard(cookie))({ children: 'SYNTHETIC_CHILD' });
        await redirects(() => execute(), '/login');
        assert.equal(await execute(cookie), 'SYNTHETIC_CHILD');
      }
    });
    await scenario('direct API rejects anonymous mutations and never accepts a supplied identity', async () => {
      assert.equal((await api('get-session')).data, null);
      assert.equal((await api('update-user', { name: 'Intruder' })).status, 401);
      assert.equal((await api('list-sessions')).status, 401);
      assert.equal((await api(`get-session?userId=${admin.id}`, undefined, student.cookie)).data.user.id, student.id);
      const denied = await api('update-user', { userId: admin.id, name: 'Intruder' }, student.cookie);
      assert.equal(denied.status, 400);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).name, 'Synthetic Page User');
    });
    await scenario('student cannot revoke another users session; ownership is enforced by the real API', async () => {
      await api('revoke-session', { token: admin.data.token }, student.cookie);
      assert.ok(await db.session.findUnique({ where: { token: admin.data.token } }));
      assert.ok(await render('app/admin/dashboard/page.tsx', admin.cookie));
    });
    await scenario('real logout revokes access to actual page entry points', async () => {
      assert.equal((await api('sign-out', {}, student.cookie)).status, 200);
      await redirects(() => render('app/aluno/dashboard/page.tsx', student.cookie), '/login');
    });
  } catch { throw new Error('PRIVATE_ACCESS_SETUP_FAILED_REDACTED'); }
  finally {
    try {
      if (verified && ids.length) {
        await db.subscription.deleteMany({ where: { userId: { in: ids } } });
        await db.session.deleteMany({ where: { userId: { in: ids } } });
        await db.account.deleteMany({ where: { userId: { in: ids } } });
        await db.user.deleteMany({ where: { id: { in: ids } } });
      }
      if (verified && planId) await db.plan.delete({ where: { id: planId } });
    } catch { throw new Error('PRIVATE_ACCESS_CLEANUP_FAILED_REDACTED'); }
    finally { await db.$disconnect(); }
  }
});
