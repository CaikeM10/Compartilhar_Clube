const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { validateTarget, verifyServer } = require('../scripts/auth-test-safety.cjs');

test('central server authentication and authorization with real local database', async t => {
  const url = validateTarget(process.env.TEST_DATABASE_URL);
  const { PrismaClient } = require(process.env.AUTH_TEST_CLIENT);
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  const ids = [];
  let planId, verified = false;
  const scenario = (name, fn) => t.test(name, async () => {
    try { await fn(); }
    catch (error) { throw new Error(`Scenario failed: ${name}; code=${/^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'REDACTED'}`); }
  });
  try {
    await verifyServer(db);
    verified = true;
    const load = name => import(pathToFileURL(path.join(process.env.AUTH_SERVER_TEST_MODULES, `${name}.mjs`)).href);
    const { createServerAuth, readAuthEnvironment } = await load('config');
    const { createAuthorization, AuthorizationError } = await load('authorization-core');
    const { handleAuthRequest } = await load('http');
    const secret = randomBytes(48).toString('base64url');
    const environment = readAuthEnvironment({ BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'http://127.0.0.1:3000', NODE_ENV: 'test' });
    const auth = createServerAuth(db, environment);
    const password = randomBytes(30).toString('base64url');
    const request = async (endpoint, body, cookie, instance = auth, base = environment.baseURL, origin = base) => {
      const response = await handleAuthRequest(new Request(`${base}/api/auth/${endpoint}`, {
        method: body ? 'POST' : 'GET',
        headers: { origin, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }), () => instance);
      const text = await response.text();
      return { status: response.status, data: text ? JSON.parse(text) : null, headers: response.headers,
        cookie: response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') };
    };
    const register = async email => {
      const result = await request('sign-up/email', { email, password, name: 'Synthetic Server Test' });
      assert.equal(result.status, 200);
      ids.push(result.data.user.id);
      return { ...result, id: result.data.user.id, email };
    };
    const signin = email => request('sign-in/email', { email, password });
    const as = (cookie, clock) => createAuthorization(auth, db, async () => new Headers({ cookie: cookie || '', 'x-user-id': 'untrusted', 'x-role': 'ADMIN' }), clock);
    const denied = (fn, status, code) => assert.rejects(fn, error => error instanceof AuthorizationError && error.status === status && error.code === code);
    let student, admin;

    await scenario('configuration rejects missing secret, malformed URL and HTTP production', async () => {
      for (const env of [{}, { BETTER_AUTH_SECRET: 'short', BETTER_AUTH_URL: environment.baseURL },
        { BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: environment.baseURL, NODE_ENV: 'production' },
        { BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'http://remote.invalid' },
        { BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'https://user:password@example.invalid' }]) {
        assert.throws(() => readAuthEnvironment(env), /^Error: AUTH_/);
      }
    });
    await scenario('real signup defaults to STUDENT and creates HttpOnly SameSite cookie', async () => {
      student = await register('student-server@example.invalid');
      admin = await register('admin-fixture-server@example.invalid');
      // Synthetic fixture only, with random runtime password, removed in finally.
      await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
      const user = await db.user.findUniqueOrThrow({ where: { id: student.id } });
      assert.equal(user.role, 'STUDENT');
      assert.equal(user.emailVerified, false);
      assert.equal(user.disabledAt, null);
      const cookie = student.headers.getSetCookie().join(';');
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Lax/i);
      assert.match(cookie, /Path=\//i);
      assert.doesNotMatch(cookie, /Domain=/i);
      assert.equal(student.headers.get('cache-control'), 'no-store');
      assert.equal(student.data.user.role, undefined);
      assert.equal(student.data.user.disabledAt, undefined);
    });
    await scenario('valid session grants account access without a subscription and omits token', async () => {
      const account = await as(student.cookie).requireSession();
      assert.equal(account.user.id, student.id);
      assert.equal(account.user.role, 'STUDENT');
      assert.equal(account.session.token, undefined);
      assert.equal(account.user.password, undefined);
      assert.equal(await db.subscription.count({ where: { userId: student.id } }), 0);
    });
    await scenario('missing and forged cookies fail; public session response has no user data', async () => {
      await denied(() => as('').requireSession(), 401, 'UNAUTHENTICATED');
      await denied(() => as('compartilhar-clube.session_token=forged').requireSession(), 401, 'UNAUTHENTICATED');
      assert.equal((await request('get-session')).data, null);
    });
    await scenario('ADMIN allowed, STUDENT denied regardless of supplied headers; demotion takes effect immediately', async () => {
      assert.equal((await as(admin.cookie).requireAdmin()).user.id, admin.id);
      await denied(() => as(student.cookie).requireAdmin(), 403, 'FORBIDDEN');
      await db.user.update({ where: { id: admin.id }, data: { role: 'STUDENT' } });
      await denied(() => as(admin.cookie).requireAdmin(), 403, 'FORBIDDEN');
      await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    });
    await scenario('expired session denied by reusable helper', async () => {
      const login = await signin(student.email);
      await db.session.update({ where: { token: login.data.token }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await denied(() => as(login.cookie).requireSession(), 401, 'UNAUTHENTICATED');
    });
    await scenario('revocation through Better Auth immediately denies reusable helper', async () => {
      const login = await signin(student.email);
      assert.equal((await request('revoke-session', { token: login.data.token }, student.cookie)).status, 200);
      await denied(() => as(login.cookie).requireSession(), 401, 'UNAUTHENTICATED');
    });
    await scenario('blocked account denied on old session, new login and user mutation', async () => {
      await db.user.update({ where: { id: student.id }, data: { disabledAt: new Date() } });
      const count = await db.session.count({ where: { userId: student.id } });
      await denied(() => as(student.cookie).requireSession(), 403, 'FORBIDDEN');
      await denied(() => as(student.cookie).requireActiveSubscription(), 403, 'FORBIDDEN');
      const login = await signin(student.email);
      assert.equal(login.status, 403);
      assert.equal(login.data.user, undefined);
      assert.equal(await db.session.count({ where: { userId: student.id } }), count);
      const session = await request('get-session', undefined, student.cookie);
      assert.equal(session.status, 403);
      assert.equal(session.data.user, undefined);
      assert.equal((await request('update-user', { name: 'Not allowed' }, student.cookie)).status, 403);
      assert.equal((await request('update-user', { disabledAt: null }, student.cookie)).status, 400);
      assert.ok((await db.user.findUniqueOrThrow({ where: { id: student.id } })).disabledAt);
      await db.user.update({ where: { id: student.id }, data: { disabledAt: null } });
    });
    await scenario('blocked ADMIN cannot obtain administrative authorization', async () => {
      await db.user.update({ where: { id: admin.id }, data: { disabledAt: new Date() } });
      await denied(() => as(admin.cookie).requireAdmin(), 403, 'FORBIDDEN');
      await db.user.update({ where: { id: admin.id }, data: { disabledAt: null } });
    });
    await scenario('missing subscription denies content, including for ADMIN, but preserves account access', async () => {
      for (const user of [student, admin]) {
        await denied(() => as(user.cookie).requireActiveSubscription(), 403, 'SUBSCRIPTION_REQUIRED');
        assert.equal((await as(user.cookie).requireSession()).user.id, user.id);
      }
    });
    await scenario('active, future, expired, cancelled and boundary subscriptions use server database dates', async () => {
      // Disposable relational fixture; no real catalog entries or commercial rules changed.
      const plan = await db.plan.create({ data: { name: 'AUTH_TEST_SYNTHETIC_ONLY', price: 1, duration: 1 } });
      planId = plan.id;
      const at = new Date('2026-11-05T12:00:00.000Z');
      const before = new Date(at.getTime() - 1000), after = new Date(at.getTime() + 1000);
      for (const sample of [
        { status: 'active', startDate: before, endDate: after, allowed: true },
        { status: 'active', startDate: after, endDate: new Date(at.getTime() + 2000), allowed: false },
        { status: 'active', startDate: before, endDate: before, allowed: false },
        { status: 'cancelled', startDate: before, endDate: after, allowed: false },
        { status: 'pending', startDate: before, endDate: after, allowed: false },
        { status: 'active', startDate: at, endDate: after, allowed: true },
        { status: 'active', startDate: before, endDate: at, allowed: false },
      ]) {
        const { allowed, ...data } = sample;
        const subscription = await db.subscription.create({ data: { ...data, userId: student.id, planId } });
        const helpers = as(student.cookie, () => at);
        if (allowed) assert.equal((await helpers.requireActiveSubscription()).subscription.id, subscription.id);
        else await denied(() => helpers.requireActiveSubscription(), 403, 'SUBSCRIPTION_REQUIRED');
        await db.subscription.delete({ where: { id: subscription.id } });
      }
    });
    await scenario('another user subscription cannot authorize content; valid subscription is found among future ones', async () => {
      const now = new Date(), end = new Date(now.getTime() + 60000);
      const owned = await db.subscription.create({ data: { userId: admin.id, planId, status: 'active', startDate: now, endDate: end } });
      await denied(() => as(student.cookie).requireActiveSubscription(), 403, 'SUBSCRIPTION_REQUIRED');
      await db.subscription.update({ where: { id: owned.id }, data: { userId: student.id } });
      const future = await db.subscription.create({ data: { userId: student.id, planId, status: 'active', startDate: end, endDate: new Date(end.getTime() + 60000) } });
      assert.equal((await as(student.cookie).requireActiveSubscription()).subscription.id, owned.id);
      await db.subscription.deleteMany({ where: { id: { in: [owned.id, future.id] } } });
    });
    await scenario('client role, emailVerified, disabledAt, id and userId rejected independently on signup/update', async () => {
      for (const payload of [{ role: 'ADMIN' }, { emailVerified: true }, { disabledAt: null }, { disabledAt: new Date().toISOString() }, { id: admin.id }, { userId: admin.id }]) {
        const signup = await request('sign-up/email', { name: 'Attack', email: 'attack-server@example.invalid', password, ...payload });
        assert.equal(signup.status, 400);
        assert.equal((await request('update-user', { name: 'Attack', ...payload }, student.cookie)).status, 400);
      }
      assert.equal(await db.user.findUnique({ where: { email: 'attack-server@example.invalid' } }), null);
      const user = await db.user.findUniqueOrThrow({ where: { id: student.id } });
      assert.equal(user.role, 'STUDENT');
      assert.equal(user.emailVerified, false);
      assert.equal(user.disabledAt, null);
    });
    await scenario('cross-origin mutation denied and self-service deletion disabled with Restrict preserved', async () => {
      const crossOrigin = await request('update-user', { name: 'Cross origin' }, student.cookie, auth, environment.baseURL, 'https://attacker.invalid');
      assert.equal(crossOrigin.status, 403, 'Cross-origin must be forbidden');
      const result = await request('delete-user', { password }, student.cookie);
      console.log(`Guard HTTP statuses: cross-origin=${crossOrigin.status}, delete-user=${result.status}`);
      assert.ok([400, 403, 404].includes(result.status));
      assert.ok(await db.user.findUnique({ where: { id: student.id } }));
    });
    await scenario('HTTPS configuration emits Secure HttpOnly cookies without domain sharing', async () => {
      const baseURL = 'https://auth-test.example.invalid';
      const secure = createServerAuth(db, readAuthEnvironment({ BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: baseURL, NODE_ENV: 'production' }));
      // In-process handler only; no request is sent to this synthetic domain.
      const login = await request('sign-in/email', { email: student.email, password }, undefined, secure, baseURL);
      assert.equal(login.status, 200);
      const cookies = login.headers.getSetCookie().join(';');
      assert.match(cookies, /; Secure/i);
      assert.match(cookies, /HttpOnly/i);
      assert.match(cookies, /__Secure-compartilhar-clube/);
      assert.doesNotMatch(cookies, /Domain=/i);
    });
    await scenario('configuration failures return generic no-store 503 without exception details', async () => {
      const response = await handleAuthRequest(new Request('http://127.0.0.1:3000/api/auth/get-session'), () => { throw new Error('PRIVATE_DIAGNOSTIC'); });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'AUTH_UNAVAILABLE' });
      assert.equal(response.headers.get('cache-control'), 'no-store');
    });
  } catch { throw new Error('SERVER_AUTH_SETUP_FAILED_REDACTED'); }
  finally {
    try {
      if (verified && ids.length) {
        await db.subscription.deleteMany({ where: { userId: { in: ids } } });
        await db.session.deleteMany({ where: { userId: { in: ids } } });
        await db.account.deleteMany({ where: { userId: { in: ids } } });
        await db.user.deleteMany({ where: { id: { in: ids } } });
      }
      if (verified && planId) await db.plan.delete({ where: { id: planId } });
    } catch { throw new Error('SERVER_AUTH_CLEANUP_FAILED_REDACTED'); }
    finally { await db.$disconnect(); }
  }
});
