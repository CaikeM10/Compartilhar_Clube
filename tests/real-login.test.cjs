const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomBytes } = require('node:crypto');
const ts = require('typescript');
const { validateTarget, verifyServer } = require('../scripts/auth-test-safety.cjs');
const root = path.resolve(__dirname, '..');

test('login and layout JSX unchanged; no simulated credentials or token storage remain', () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs/real-login/before.json'), 'utf8'));
  for (const [file, before] of Object.entries(baseline.views)) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const ast = ts.createSourceFile('view.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let expression;
    function visit(node) {
      if (ts.isReturnStatement(node) && node.expression && ts.isParenthesizedExpression(node.expression) && !expression) expression = node.expression.getText(ast);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    if (file === 'components/layout/MemberLayout.tsx') {
      const routes = text => [...text.matchAll(/(?:href|onClick|onClick)=((?:"[^"]*")|(?:\{[^}]*\}))/g)].map(x => x[0]).sort();
      assert.deepEqual(routes(expression), routes(before));
      assert.match(source, /Minhas Aulas/);
      assert.doesNotMatch(expression, /fixed bottom-6 right-6/);
      assert.match(expression, /<footer/);
    } else assert.equal(expression, before, `Visual changed: ${file}`);
  }
  const context = fs.readFileSync(path.join(root, 'contexts/AuthContext.tsx'), 'utf8');
  assert.doesNotMatch(context, /mockUser|mock_token|includes\(["']admin|localStorage\.(?:getItem|setItem)/);
  assert.match(context, /createSessionStore\(sessionClient\)/);
  assert.match(context, /useSyncExternalStore/);
  assert.match(context, /store\.refresh\(\)/);
  const login = fs.readFileSync(path.join(root, 'app/login/page.tsx'), 'utf8');
  assert.match(login, /const destination = await login\(email, password\)/);
  assert.match(login, /router\.replace\(destination\)/);
});

test('real Better Auth browser SDK, session state and server account endpoint', async t => {
  const url = validateTarget(process.env.TEST_DATABASE_URL);
  const { PrismaClient } = require(process.env.AUTH_TEST_CLIENT);
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  const ids = [];
  let verified = false;
  const scenario = (name, fn) => t.test(name, async () => {
    try { await fn(); } catch (error) { throw new Error(`Scenario failed: ${name}; code=${/^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'REDACTED'}`); }
  });
  try {
    await verifyServer(db); verified = true;
    const load = name => import(pathToFileURL(path.join(process.env.AUTH_SERVER_TEST_MODULES, `${name}.mjs`)).href);
    const { createServerAuth, readAuthEnvironment } = await load('config');
    const { createAuthorization } = await load('authorization-core');
    const { handleAuthRequest } = await load('http');
    const { handleAccountSession } = await load('account-http');
    const { createSessionClient } = await load('client');
    const { createSessionStore } = await load('session-store');
    const baseURL = 'http://127.0.0.1:3000';
    const auth = createServerAuth(db, readAuthEnvironment({ BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'), BETTER_AUTH_URL: baseURL, NODE_ENV: 'test' }));
    const password = randomBytes(32).toString('base64url');

    // Only the browser transport/cookie jar is emulated. SDK, handlers, helpers,
    // password verification and persistence are the real installed implementations.
    function browser(jar = new Map()) {
      const cookieAttributes = [];
      const transport = async (input, init) => {
        const request = new Request(input, init);
        const headers = new Headers(request.headers);
        headers.set('origin', baseURL);
        if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
        const forwarded = new Request(request, { headers });
        const current = new URL(forwarded.url);
        assert.equal(current.origin, baseURL, 'No external HTTP allowed');
        const response = current.pathname === '/api/account/session'
          ? await handleAccountSession(createAuthorization(auth, db, async () => headers).requireSession)
          : await handleAuthRequest(forwarded, () => auth);
        for (const cookie of response.headers.getSetCookie()) {
          cookieAttributes.push(cookie.slice(cookie.indexOf(';')));
          const first = cookie.split(';')[0], index = first.indexOf('=');
          const name = first.slice(0, index), value = first.slice(index + 1);
          if (/Max-Age=0(?:;|$)/i.test(cookie) || value === '') jar.delete(name); else jar.set(name, value);
        }
        return response;
      };
      const client = createSessionClient(transport, baseURL);
      const post = async (endpoint, data) => {
        const response = await transport(`${baseURL}/api/auth/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
        const text = await response.text();
        return { status: response.status, data: text ? JSON.parse(text) : null };
      };
      return { client, jar, cookieAttributes, transport, post };
    }

    const registration = browser();
    const studentEmail = 'contains-admin-but-student@example.invalid';
    const adminEmail = 'privileged-fixture@example.invalid';
    let studentId, adminId;
    await scenario('public registration is STUDENT and creates no subscription or admin privilege', async () => {
      const result = await registration.post('sign-up/email', { name: 'Synthetic Login', email: studentEmail, password });
      assert.equal(result.status, 200); studentId = result.data.user.id; ids.push(studentId);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: studentId } })).role, 'STUDENT');
      assert.equal(await db.subscription.count({ where: { userId: studentId } }), 0);
      const fixture = await registration.post('sign-up/email', { name: 'Synthetic Admin', email: adminEmail, password });
      assert.equal(fixture.status, 200); adminId = fixture.data.user.id; ids.push(adminId);
      await db.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } });
    });

    await scenario('real SDK login succeeds with persistent cookies and server-directed STUDENT destination', async () => {
      const current = browser();
      const store = createSessionStore(current.client);
      assert.equal(await store.login(studentEmail, password), '/aluno/dashboard');
      assert.equal(store.getSnapshot().user.id, studentId);
      assert.equal(store.getSnapshot().user.role, 'student');
      assert.equal(store.getSnapshot().isLoading, false);
      assert.ok(current.cookieAttributes.some(c => /Max-Age=[1-9]\d*/i.test(c) && /HttpOnly/i.test(c)));
      assert.equal(store.getSnapshot().user.token, undefined);
      assert.equal(store.getSnapshot().user.password, undefined);
    });

    await scenario('fresh client and state instance restore the same account using only the persisted cookie', async () => {
      const first = browser();
      await first.client.signIn(studentEmail, password);
      const reloaded = browser(first.jar);
      const store = createSessionStore(reloaded.client);
      assert.equal(store.getSnapshot().user, null);
      await store.refresh();
      assert.equal(store.getSnapshot().user.id, studentId);
      assert.ok(store.getSnapshot().user.createdAt instanceof Date);
      assert.equal((await reloaded.client.read()).destination, '/aluno/dashboard');
    });

    await scenario('invalid password and nonexistent email have identical generic client errors', async () => {
      for (const email of [studentEmail, 'unknown@example.invalid']) {
        const store = createSessionStore(browser().client);
        await assert.rejects(store.login(email, 'invalid-credential'), { message: 'AUTHENTICATION_FAILED' });
        assert.equal(store.getSnapshot().user, null);
      }
    });

    await scenario('ADMIN destination comes from database role, not email heuristic or request input', async () => {
      const current = browser();
      const store = createSessionStore(current.client);
      assert.equal(await store.login(adminEmail, password), '/admin/dashboard');
      assert.equal(store.getSnapshot().user.role, 'admin');
      await db.user.update({ where: { id: adminId }, data: { role: 'STUDENT' } });
      await store.refresh();
      assert.equal(store.getSnapshot().user.role, 'student');
      assert.equal((await current.client.read()).destination, '/aluno/dashboard');
      await db.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } });
    });

    await scenario('blocked account cannot login and previous session restores no authenticated state', async () => {
      const current = browser();
      const store = createSessionStore(current.client);
      await store.login(studentEmail, password);
      await db.user.update({ where: { id: studentId }, data: { disabledAt: new Date() } });
      await store.refresh();
      assert.equal(store.getSnapshot().user, null);
      await assert.rejects(browser().client.signIn(studentEmail, password), { message: 'AUTHENTICATION_FAILED' });
      await db.user.update({ where: { id: studentId }, data: { disabledAt: null } });
    });

    await scenario('logout revokes database session and clears UI; expired session also restores no user', async () => {
      const current = browser();
      const store = createSessionStore(current.client);
      await store.login(studentEmail, password);
      const oldJar = new Map(current.jar);
      const count = await db.session.count({ where: { userId: studentId } });
      await store.logout();
      assert.equal(store.getSnapshot().user, null);
      assert.equal(await db.session.count({ where: { userId: studentId } }), count - 1);
      assert.equal(await browser(oldJar).client.read(), null);
      await store.login(studentEmail, password);
      await db.session.updateMany({ where: { userId: studentId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await store.refresh();
      assert.equal(store.getSnapshot().user, null);
    });

    await scenario('slow pre-logout session response cannot resurrect authenticated UI', async () => {
      const current = browser();
      let delay = false, release, captured;
      const ready = new Promise(resolve => { captured = resolve; });
      const delayedClient = createSessionClient(async (...args) => {
        const response = await current.transport(...args);
        if (delay && String(args[0]).includes('/api/account/session')) {
          delay = false;
          await new Promise(resolve => { release = resolve; captured(); });
        }
        return response;
      }, baseURL);
      const store = createSessionStore(delayedClient);
      await store.login(studentEmail, password);
      delay = true;
      const pending = store.refresh(); await ready;
      await store.logout(); release(); await pending;
      assert.equal(store.getSnapshot().user, null);
    });

    await scenario('authenticated account endpoint rejects anonymous reads and ignores arbitrary userId and role', async () => {
      const anonymous = browser();
      const response = await anonymous.transport(`${baseURL}/api/account/session?userId=${adminId}&role=ADMIN`);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).user, null);
      const current = browser(); await current.client.signIn(studentEmail, password);
      const own = await current.transport(`${baseURL}/api/account/session?userId=${adminId}&role=ADMIN`);
      assert.match(own.headers.get('cache-control'), /no-store/);
      const data = await own.json();
      assert.equal(data.user.id, studentId);
      assert.deepEqual(Object.keys(data.user).sort(), ['createdAt', 'email', 'id', 'name', 'role']);
      for (const field of [{ role: 'ADMIN' }, { emailVerified: true }, { disabledAt: null }]) {
        assert.equal((await current.post('update-user', field)).status, 400);
        assert.equal((await anonymous.post('sign-up/email', { name: 'Attack', email: 'attack-login@example.invalid', password, ...field })).status, 400);
      }
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: studentId } })).role, 'STUDENT');
    });

    await scenario('historical account remains unchanged; arbitrary credentials do not create a password or replace its ID', async () => {
      const historical = await db.user.create({ data: { id: 'historical-login-fixed-id', email: 'historical-login@example.invalid', name: null, password: null } });
      ids.push(historical.id);
      await assert.rejects(browser().client.signIn(historical.email, password), { message: 'AUTHENTICATION_FAILED' });
      const existing = await db.user.findUniqueOrThrow({ where: { email: historical.email } });
      assert.equal(existing.id, historical.id); assert.equal(existing.name, null); assert.equal(existing.password, null);
      assert.equal(await db.account.count({ where: { userId: historical.id } }), 0);
    });
  } catch { throw new Error('REAL_LOGIN_SETUP_FAILED_REDACTED'); }
  finally {
    try {
      if (verified && ids.length) {
        await db.session.deleteMany({ where: { userId: { in: ids } } });
        await db.account.deleteMany({ where: { userId: { in: ids } } });
        await db.user.deleteMany({ where: { id: { in: ids } } });
      }
    } catch { throw new Error('REAL_LOGIN_CLEANUP_FAILED_REDACTED'); }
    finally { await db.$disconnect(); }
  }
});
