// No database, no network. Forced change of the initial password and the guards that depend on it:
// login and logout keep working, every protected page/API is blocked until the change, the change itself is allowed,
// and the Better Auth contract the panel relies on (no session on server-side sign-up, synthetic duplicates).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { redirect, getURLFromRedirectError } = require('next/dist/client/components/redirect');
const { isRedirectError } = require('next/dist/client/components/redirect-error');
const { loadAuthConfiguration } = require('../scripts/local-auth-admin.cjs');

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

const authCore = load('lib/auth/authorization-core.ts');
const pageCore = load('lib/auth/page-access-core.ts', { './authorization-core': authCore });
const accountHttp = load('lib/auth/account-http.ts', { './authorization-core': authCore });
const validation = load('lib/admin/user-validation.ts', { './manual-access-rules': load('lib/admin/manual-access-rules.ts') });
const passwordCore = load('lib/account/password-core.ts', { '@/lib/admin/user-validation': validation });
const NOW = new Date('2026-11-19T12:00:00Z');

function guards(row, { subscribed = false } = {}) {
  const auth = { api: { getSession: async () => row ? { user: { id: row.id }, session: { id: 's', expiresAt: new Date(NOW.getTime() + 3600000) } } : null } };
  const db = {
    user: { findUnique: async () => row && { name: null, email: `${row.id}@example.invalid`, emailVerified: true, createdAt: NOW, disabledAt: null, ...row } },
    subscription: { findFirst: async () => subscribed ? { id: 'sub', planId: 'p', startDate: NOW, endDate: new Date('2030-01-01') } : null },
    manualAccessGrant: { findFirst: async () => null },
  };
  return authCore.createAuthorization(auth, db, async () => new Headers(), () => NOW);
}
const code = expected => error => error.code === expected;

test('pending initial password blocks every protected guard but not the account/password-change session', async () => {
  for (const row of [{ id: 'a', role: 'ADMIN', mustChangePassword: true, isPrincipalAdmin: true }, { id: 's', role: 'STUDENT', mustChangePassword: true }]) {
    const g = guards(row, { subscribed: true });
    for (const guard of ['requireSession', 'requireAdmin', 'requirePrincipalAdmin', 'requireActiveSubscription']) {
      await assert.rejects(g[guard](), code('PASSWORD_CHANGE_REQUIRED'), `${row.role} ${guard}`);
    }
    const account = await g.requirePasswordChangeSession();
    assert.equal(account.user.mustChangePassword, true);
  }
  await assert.rejects(guards(null).requirePasswordChangeSession(), code('UNAUTHENTICATED'));
});

test('principal guard: only an ADMIN explicitly marked principal in the database; legacy rows without the flag are not', async () => {
  await assert.rejects(guards({ id: 'a', role: 'ADMIN' }).requirePrincipalAdmin(), code('PRINCIPAL_ADMIN_REQUIRED'));
  await assert.rejects(guards({ id: 'a', role: 'ADMIN', isPrincipalAdmin: 'true' }).requirePrincipalAdmin(), code('PRINCIPAL_ADMIN_REQUIRED'));
  await assert.rejects(guards({ id: 's', role: 'STUDENT', isPrincipalAdmin: true }).requirePrincipalAdmin(), code('FORBIDDEN'));
  const principal = await guards({ id: 'p', role: 'ADMIN', isPrincipalAdmin: true }).requirePrincipalAdmin();
  assert.equal(principal.user.isPrincipalAdmin, true);
  // Existing accounts (no new columns set) keep working exactly as before.
  const legacy = await guards({ id: 'l', role: 'ADMIN' }).requireAdmin();
  assert.equal(legacy.user.mustChangePassword, false); assert.equal(legacy.user.isPrincipalAdmin, false);
});

test('pages redirect a pending account to the password page; the password page itself is reachable', async () => {
  const pageFor = row => pageCore.createPageAccess(guards(row, { subscribed: true }), redirect);
  const redirects = (promise, destination) => assert.rejects(promise, error => isRedirectError(error) && getURLFromRedirectError(error) === destination);
  const pending = pageFor({ id: 'a', role: 'ADMIN', mustChangePassword: true });
  for (const access of ['account', 'admin', 'subscriber']) await redirects(pending(access), '/conta/alterar-senha');
  assert.equal((await pending('password-change')).user.id, 'a');
  await redirects(pageFor(null)('password-change'), '/login');
  assert.equal(pageCore.PASSWORD_CHANGE_PATH, '/conta/alterar-senha');
});

test('login keeps working: the session endpoint answers 200 and sends a pending account to the password page', async () => {
  for (const [row, destination] of [
    [{ id: 'a', role: 'ADMIN', mustChangePassword: true }, '/conta/alterar-senha'],
    [{ id: 's', role: 'STUDENT', mustChangePassword: true }, '/conta/alterar-senha'],
    [{ id: 'a', role: 'ADMIN' }, '/admin/dashboard'],
    [{ id: 's', role: 'STUDENT' }, '/aluno/dashboard'],
  ]) {
    const response = await accountHttp.handleAccountSession(guards(row).requirePasswordChangeSession);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.destination, destination);
    assert.deepEqual(Object.keys(body.user).sort(), ['createdAt', 'email', 'id', 'name', 'role']);
  }
  const client = fs.readFileSync(path.join(root, 'lib/auth/client.ts'), 'utf8');
  assert.match(client, /\["\/admin\/dashboard", "\/aluno\/dashboard", "\/conta\/alterar-senha"\]\.includes\(data\.destination\)/);
});

function passwordService(row, { failWith } = {}) {
  const calls = [];
  const updates = [];
  const db = { user: { updateMany: async args => { updates.push(args); return { count: 1 }; } } };
  const auth = { api: { changePassword: async args => { calls.push(args); if (failWith) throw Object.assign(new Error('x'), { statusCode: failWith }); return { token: 't' }; } } };
  return { change: passwordCore.createPasswordChangeService(db, guards(row).requirePasswordChangeSession, auth), calls, updates };
}

test('password change: through Better Auth with the current password, other sessions revoked, flag cleared after success', async () => {
  const headers = new Headers({ cookie: 'session=abc' });
  const service = passwordService({ id: 'a', role: 'ADMIN', mustChangePassword: true });
  assert.deepEqual(await service.change({ currentPassword: 'Inicial-1234567', newPassword: 'Nova-senha-forte-1' }, headers), { destination: '/admin/dashboard' });
  assert.equal(service.calls.length, 1);
  assert.equal(service.calls[0].headers, headers);
  assert.deepEqual(service.calls[0].body, { currentPassword: 'Inicial-1234567', newPassword: 'Nova-senha-forte-1', revokeOtherSessions: true });
  assert.deepEqual(service.updates, [{ where: { id: 'a' }, data: { mustChangePassword: false } }]);

  const student = passwordService({ id: 's', role: 'STUDENT', mustChangePassword: true });
  assert.deepEqual(await student.change({ currentPassword: 'Inicial-123', newPassword: 'Aluno-123' }, headers), { destination: '/aluno/dashboard' });
});

test('password change refusals keep the flag on and never call Better Auth with invalid input', async () => {
  const headers = new Headers();
  for (const [input, expected] of [
    [{ currentPassword: 'Inicial-1234567', newPassword: 'Curta-1234' }, 'INVALID_PASSWORD'], // ADMIN needs 12+
    [{ currentPassword: 'Mesma-senha-1234', newPassword: 'Mesma-senha-1234' }, 'PASSWORD_UNCHANGED'],
    [{ currentPassword: 'x', newPassword: 'Nova-senha-forte-1', mustChangePassword: false }, 'INVALID_PASSWORD'],
    [{ newPassword: 'Nova-senha-forte-1' }, 'INVALID_PASSWORD'],
  ]) {
    const service = passwordService({ id: 'a', role: 'ADMIN', mustChangePassword: true });
    await assert.rejects(service.change(input, headers), code(expected));
    assert.equal(service.calls.length, 0); assert.equal(service.updates.length, 0);
  }
  const wrong = passwordService({ id: 'a', role: 'ADMIN', mustChangePassword: true }, { failWith: 400 });
  await assert.rejects(wrong.change({ currentPassword: 'errada-123456', newPassword: 'Nova-senha-forte-1' }, headers), code('INVALID_CURRENT_PASSWORD'));
  assert.equal(wrong.updates.length, 0, 'flag stays on when Better Auth refuses');
  const outage = passwordService({ id: 'a', role: 'ADMIN', mustChangePassword: true }, { failWith: 500 });
  await assert.rejects(outage.change({ currentPassword: 'Inicial-1234567', newPassword: 'Nova-senha-forte-1' }, headers), error => error.statusCode === 500);
  await assert.rejects(passwordService(null).change({ currentPassword: 'a', newPassword: 'Nova-senha-forte-1' }, headers), code('UNAUTHENTICATED'));
});

test('real config: public sign-up closed; the panel instance has sign-up without auto sign-in and without the cookie plugin', async () => {
  const { createServerAuth } = await loadAuthConfiguration();
  const environment = { secret: 'x'.repeat(48), baseURL: 'http://127.0.0.1:3000', secureCookies: false };
  const fakeDb = new Proxy({}, { get: () => ({}) });
  const application = createServerAuth(fakeDb, environment);
  assert.equal(application.options.emailAndPassword.disableSignUp, true);
  assert.notEqual(application.options.emailAndPassword.autoSignIn, false);
  assert.deepEqual(application.options.plugins.map(plugin => plugin.id), ['next-cookies']);
  const panel = createServerAuth(fakeDb, { ...environment, serverProvisioning: true });
  assert.equal(panel.options.emailAndPassword.disableSignUp, false);
  assert.equal(panel.options.emailAndPassword.autoSignIn, false);
  assert.deepEqual(panel.options.plugins, []);
  const config = fs.readFileSync(path.join(root, 'lib/auth/config.ts'), 'utf8');
  assert.match(config, /\["role", "emailVerified", "disabledAt", "userId", "id", "isPrincipalAdmin", "mustChangePassword"\]/);
  // readAuthEnvironment (the only path from process.env) never enables sign-up or provisioning.
  assert.doesNotMatch(config.split('export function readAuthEnvironment')[1].split('\n}\n')[0], /serverProvisioning|allowSignUp/);
  // Only the server-side admin module creates the provisioning instance; no route mounts it.
  for (const file of ['app/api/auth/[...all]/route.ts', 'lib/auth/server.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /serverProvisioning|allowSignUp/, file);
  }
});

test('installed Better Auth contract: autoSignIn=false creates user + credential and no session; duplicates get a synthetic user', async () => {
  const { betterAuth } = await import('better-auth');
  const { memoryAdapter } = await import('better-auth/adapters/memory');
  const store = { user: [], account: [], session: [], verification: [] };
  const auth = betterAuth({
    secret: 'y'.repeat(48), baseURL: 'http://127.0.0.1:3000', database: memoryAdapter(store), logger: { disabled: true },
    emailAndPassword: { enabled: true, autoSignIn: false },
  });
  const created = await auth.api.signUpEmail({ body: { name: 'Ana', email: 'Ana@Example.invalid', password: 'senha-inicial-1' } });
  assert.equal(created.token, null);
  assert.equal(store.user.length, 1); assert.equal(store.user[0].email, 'ana@example.invalid');
  assert.equal(store.account.length, 1); assert.equal(store.account[0].providerId, 'credential');
  assert.notEqual(store.account[0].password, 'senha-inicial-1');
  assert.equal(store.session.length, 0, 'no session is created for the new account');
  const duplicate = await auth.api.signUpEmail({ body: { name: 'Outra', email: 'ANA@example.invalid', password: 'outra-senha-12' } });
  assert.equal(store.user.length, 1, 'no second account');
  assert.notEqual(duplicate.user.id, store.user[0].id, 'synthetic id: the service must confirm the row really exists');
  assert.equal(store.user.some(row => row.id === duplicate.user.id), false);
});
