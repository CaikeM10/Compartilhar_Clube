// In-memory only: no PrismaClient, no database, no environment files, no network.
// Account creation and role management from /admin/usuarios through the REAL route handlers and the real
// authorization core: who may create students/administrators, privilege-escalation attempts, duplicate e-mails,
// audit, rollback, preserved sessions and no credential material in any response.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

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
const rules = load('lib/admin/manual-access-rules.ts');
const validation = load('lib/admin/user-validation.ts', { './manual-access-rules': rules });
const usersCore = load('lib/admin/users-core.ts', { './manual-access-rules': rules });
const accessCore = load('lib/admin/manual-access-core.ts', {
  '@/lib/auth/authorization-core': authCore, './manual-access-rules': rules, './user-validation': validation, './users-core': usersCore,
});
const core = load('lib/admin/user-management-core.ts', {
  '@/lib/auth/authorization-core': authCore, './users-core': usersCore, './user-validation': validation,
  './manual-access-core': accessCore, './manual-access-rules': rules,
});
const lessonCore = load('lib/lessons/service-core.ts', { './validation': load('lib/lessons/validation.ts') });
const lessonHttp = load('lib/lessons/http.ts', { './service-core': lessonCore, '@/lib/auth/authorization-core': authCore });
const usersHttp = load('lib/admin/users-http.ts', {
  '@/lib/auth/authorization-core': authCore, '@/lib/lessons/service-core': lessonCore, '@/lib/lessons/http': lessonHttp,
  './user-validation': validation,
});

const BASE = 'http://127.0.0.1:3000';
const NOW = new Date('2026-11-19T12:00:00.000Z');
const PASSWORD = 'Inicial-segura-123';

function user(id, fields = {}) {
  return { id, name: `Nome ${id}`, email: `${id}@example.invalid`, role: 'STUDENT', disabledAt: null, emailVerified: true,
    isPrincipalAdmin: false, mustChangePassword: false, createdAt: NOW, updatedAt: NOW, ...fields };
}
const pick = (row, select) => select ? Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, row[key]])) : { ...row };
const insensitive = (value, condition) => typeof condition === 'string' ? value === condition : value.toLowerCase() === condition.equals.toLowerCase();

/** In-memory database with per-transaction snapshot rollback and a real mutex for the advisory lock. */
function memoryDb({ users = [], payments = [] } = {}) {
  const state = {
    users: users.map(row => ({ ...row })),
    accounts: users.map(row => ({ id: `acc-${row.id}`, userId: row.id, providerId: 'credential', accountId: row.id, password: `scrypt$${row.id}` })),
    sessions: users.map(row => ({ id: `sess-${row.id}`, userId: row.id, token: `token-${row.id}` })),
    subscriptions: [], payments: payments.map(row => ({ ...row })), audit: [],
  };
  const db = { state, locks: 0, failAudit: false };
  let lock = Promise.resolve();
  const matchUser = (row, where = {}) => Object.entries(where).every(([key, condition]) => {
    if (key === 'email') return insensitive(row.email, condition);
    if (key === 'updatedAt') return row.updatedAt.getTime() === condition.getTime();
    return row[key] === condition;
  });
  const makeTx = () => ({
    $executeRawUnsafe: async sql => {
      if (/pg_advisory_xact_lock/.test(sql)) {
        db.locks++;
        let release;
        const previous = lock;
        lock = new Promise(resolve => { release = resolve; });
        await previous;
        db.release = release;
        return 1;
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    user: {
      findUnique: async ({ where, select }) => { const row = state.users.find(item => item.id === where.id); return row ? pick(row, select) : null; },
      findUniqueOrThrow: async ({ where, select }) => pick(state.users.find(item => item.id === where.id), select),
      findMany: async ({ select } = {}) => state.users.map(row => pick(row, select)),
      count: async ({ where }) => state.users.filter(row => matchUser(row, where)).length,
      update: async ({ where, data, select }) => {
        const row = state.users.find(item => item.id === where.id);
        Object.assign(row, data, { updatedAt: new Date(row.updatedAt.getTime() + 1000) });
        return pick(row, select);
      },
      updateMany: async ({ where, data }) => {
        const rows = state.users.filter(row => matchUser(row, where));
        for (const row of rows) Object.assign(row, data, { updatedAt: new Date(row.updatedAt.getTime() + 1000) });
        return { count: rows.length };
      },
    },
    account: { findMany: async ({ where, select }) => state.accounts.filter(row => row.userId === where.userId).map(row => pick(row, select)) },
    session: { count: async ({ where }) => state.sessions.filter(row => row.userId === where.userId).length },
    subscription: { count: async ({ where }) => state.subscriptions.filter(row => row.userId === where.userId).length },
    payment: { count: async ({ where }) => state.payments.filter(row => insensitive(row.email, where.email) && row.status === where.status).length },
    adminAuditEvent: {
      create: async ({ data }) => {
        if (db.failAudit) throw new Error('AUDIT_WRITE_FAILED');
        state.audit.push({ id: `audit-${state.audit.length + 1}`, previousRole: null, newRole: null, ...data });
        return { id: `audit-${state.audit.length}` };
      },
    },
  });
  db.$transaction = async fn => {
    const snapshot = structuredClone(state);
    db.release = () => {};
    try { return await fn(makeTx()); }
    catch (error) { Object.assign(state, snapshot); throw error; }
    finally { db.release(); }
  };
  db.user = { findMany: async args => makeTx().user.findMany(args) };
  return db;
}

/** Better Auth stand-in honouring the measured contract (autoSignIn off): duplicate -> synthetic user, no session. */
function fakeAuthFactory(db, { synthetic = false } = {}) {
  const calls = [];
  const factory = tx => ({
    api: {
      signUpEmail: async ({ body }) => {
        calls.push(Object.keys(body).sort());
        const email = body.email.toLowerCase();
        if (synthetic || db.state.users.some(row => row.email === email)) return { token: null, user: { id: 'synthetic-id', email } };
        const id = `new-${db.state.users.length + 1}`;
        db.state.users.push(user(id, { name: body.name, email, emailVerified: false }));
        db.state.accounts.push({ id: `acc-${id}`, userId: id, providerId: 'credential', accountId: id, password: `scrypt$hash-of-${id}` });
        assert.equal(typeof tx.$transaction, 'undefined', 'Better Auth receives the transaction client only');
        return { token: null, user: { id, email } };
      },
    },
  });
  return { factory, calls };
}

/** Real authorization core over an in-memory session: identity = user id in the database (or null). */
function guardsFor(db, userId, { requestUserId = userId } = {}) {
  const auth = { api: { getSession: async () => requestUserId ? { user: { id: requestUserId }, session: { id: 's', expiresAt: new Date(Date.now() + 3600000) } } : null } };
  const authDb = {
    user: { findUnique: async ({ where }) => { const row = db.state.users.find(item => item.id === where.id); return row ? { ...row } : null; } },
    subscription: { findFirst: async () => db.activeSubscriptionFor === userId ? { id: 'sub', planId: 'p', startDate: NOW, endDate: new Date('2030-01-01') } : null },
    manualAccessGrant: { findFirst: async () => null },
  };
  return authCore.createAuthorization(auth, authDb, async () => new Headers());
}

function routes(db, actorId, options = {}) {
  const guards = guardsFor(db, actorId);
  const { factory, calls } = fakeAuthFactory(db, options);
  const service = core.createUserManagementService(db, guards, factory);
  const revalidated = [];
  const shared = {
    '@/lib/admin/user-management': { getUserManagement: () => service },
    '@/lib/admin/users-http': usersHttp,
    '@/lib/auth/config': { readAuthEnvironment: () => ({ baseURL: BASE }) },
    '@/lib/auth/authorization': guards,
    'next/cache': { revalidatePath: target => revalidated.push(target) },
  };
  return {
    create: load('app/api/admin/users/route.ts', shared).POST,
    role: load('app/api/admin/users/[id]/role/route.ts', shared).PATCH,
    calls, revalidated, service,
  };
}

const json = (body, { origin = BASE, site = 'same-origin' } = {}) => ({
  method: 'POST', headers: { origin, 'sec-fetch-site': site, 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const request = (body, options) => new Request(`${BASE}/api/admin/users`, json(body, options));
const patch = (id, body, options) => new Request(`${BASE}/api/admin/users/${id}/role`, { ...json(body, options), method: 'PATCH' });
const params = id => ({ params: Promise.resolve({ id }) });
const newStudent = (fields = {}) => ({ name: 'Aluna Nova', email: 'Aluna.Nova@Example.invalid', password: PASSWORD, role: 'student', ...fields });
const newAdmin = (fields = {}) => ({ name: 'Admin Novo', email: 'admin.novo@example.invalid', password: 'Admin-inicial-1234', role: 'admin', ...fields });

function world(extra = {}) {
  return memoryDb({
    users: [
      user('principal1', { role: 'ADMIN', isPrincipalAdmin: true }),
      user('principal2', { role: 'ADMIN', isPrincipalAdmin: true }),
      user('admin1', { role: 'ADMIN' }),
      user('student1'),
      user('student2', { disabledAt: new Date('2026-11-01') }),
      user('pending', { role: 'ADMIN', isPrincipalAdmin: true, mustChangePassword: true }),
      user('disabledAdmin', { role: 'ADMIN', disabledAt: new Date('2026-11-01') }),
    ],
    ...extra,
  });
}
const unchangedSessions = (db, before) => assert.deepEqual(db.state.sessions, before, 'existing sessions are preserved');
const noSecrets = text => { assert.doesNotMatch(text, /Inicial-segura|Admin-inicial|scrypt|hash|"password"|token/i); };

test('anonymous and STUDENT accounts (with or without subscription) can never create accounts', async () => {
  for (const [actor, status, code, subscribed] of [[null, 401, 'UNAUTHENTICATED'], ['student1', 403, 'FORBIDDEN'], ['student1', 403, 'FORBIDDEN', true]]) {
    for (const body of [newStudent(), newAdmin()]) {
      const db = world();
      if (subscribed) db.activeSubscriptionFor = 'student1';
      const api = routes(db, actor);
      const response = await api.create(request(body));
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error: code });
      assert.equal(db.state.users.length, 7); assert.equal(api.calls.length, 0); assert.equal(db.state.audit.length, 0);
    }
  }
});

test('common ADMIN creates a STUDENT: Better Auth credential, forced password change, audit with the responsible admin', async () => {
  const db = world({ payments: [{ email: 'aluna.nova@example.invalid', status: 'approved' }, { email: 'ALUNA.NOVA@example.invalid', status: 'pending' }] });
  const sessions = structuredClone(db.state.sessions);
  const api = routes(db, 'admin1');
  const response = await api.create(request(newStudent()));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('set-cookie'), null, 'the administrator session is never replaced');
  const text = await response.text();
  noSecrets(text);
  const body = JSON.parse(text);
  assert.equal(body.user.email, 'aluna.nova@example.invalid');
  assert.equal(body.user.role, 'student');
  assert.equal(body.user.principal, false);
  assert.equal(body.user.mustChangePassword, true);
  assert.equal(body.priorApprovedPayments, 1, 'only approved payments are reported, as information');
  const created = db.state.users.find(row => row.id === body.user.id);
  assert.equal(created.role, 'STUDENT'); assert.equal(created.mustChangePassword, true); assert.equal(created.isPrincipalAdmin, false);
  assert.deepEqual(api.calls, [['email', 'name', 'password']], 'only name, e-mail and password reach Better Auth');
  assert.deepEqual(db.state.audit, [{ id: 'audit-1', action: 'USER_CREATED', actorId: 'admin1', targetUserId: body.user.id, previousRole: null, newRole: 'STUDENT' }]);
  assert.equal(db.state.subscriptions.length, 0); assert.equal(db.state.payments.length, 2);
  unchangedSessions(db, sessions);
  assert.deepEqual(api.revalidated, ['/admin/usuarios']);
});

test('privilege escalation: a common ADMIN cannot create an ADMIN, nor smuggle role/principal/password flags', async () => {
  const db = world();
  const api = routes(db, 'admin1');
  let response = await api.create(request(newAdmin()));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'PRINCIPAL_ADMIN_REQUIRED' });
  for (const extra of [{ role: 'ADMIN' }, { role: 'principal' }, { isPrincipalAdmin: true }, { mustChangePassword: false }, { userId: 'principal1' }, { emailVerified: true }]) {
    response = await api.create(request(newStudent(extra)));
    assert.equal(response.status, 400, JSON.stringify(extra));
    assert.deepEqual(await response.json(), { error: 'INVALID_USER' });
  }
  assert.equal(db.state.users.length, 7); assert.equal(api.calls.length, 0); assert.equal(db.state.audit.length, 0);
});

test('principal ADMIN creates a common ADMIN (never a principal one)', async () => {
  const db = world();
  const api = routes(db, 'principal1');
  const response = await api.create(request(newAdmin()));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.user.role, 'admin'); assert.equal(body.user.principal, false); assert.equal(body.user.mustChangePassword, true);
  const created = db.state.users.find(row => row.id === body.user.id);
  assert.equal(created.role, 'ADMIN'); assert.equal(created.isPrincipalAdmin, false);
  assert.deepEqual(db.state.audit.map(event => [event.action, event.actorId, event.newRole]), [['USER_CREATED', 'principal1', 'ADMIN']]);
  // Administrator passwords need at least 12 characters.
  const short = await api.create(request(newAdmin({ email: 'outro@example.invalid', password: 'Curta-12345' })));
  assert.equal(short.status, 400);
  assert.deepEqual(await short.json(), { error: 'INVALID_PASSWORD' });
});

test('duplicate e-mails are refused in any letter case, including Better Auth synthetic duplicate answers', async () => {
  const db = world();
  const api = routes(db, 'admin1');
  const response = await api.create(request(newStudent({ email: 'STUDENT1@EXAMPLE.INVALID' })));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'EMAIL_ALREADY_REGISTERED' });
  assert.equal(api.calls.length, 0);

  const racing = world();
  const raced = routes(racing, 'admin1', { synthetic: true });
  const second = await raced.create(request(newStudent()));
  assert.equal(second.status, 409);
  assert.deepEqual(await second.json(), { error: 'EMAIL_ALREADY_REGISTERED' });
  assert.equal(racing.state.users.length, 7); assert.equal(racing.state.audit.length, 0);
});

test('failures roll everything back: audit write failure leaves no account, credential or audit row', async () => {
  const db = world();
  db.failAudit = true;
  const api = routes(db, 'admin1');
  const response = await api.create(request(newStudent()));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'USERS_UNAVAILABLE' });
  assert.equal(db.state.users.length, 7); assert.equal(db.state.accounts.length, 7); assert.equal(db.state.audit.length, 0);
});

test('pending password change, disabled admins and cross-site requests are refused before any write', async () => {
  for (const [actor, code, status] of [['pending', 'PASSWORD_CHANGE_REQUIRED', 403], ['disabledAdmin', 'FORBIDDEN', 403]]) {
    const db = world();
    const api = routes(db, actor);
    const response = await api.create(request(newStudent()));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: code });
    assert.equal(api.calls.length, 0);
  }
  const db = world();
  const api = routes(db, 'principal1');
  for (const options of [{ origin: 'https://evil.example' }, { site: 'cross-site' }]) {
    const response = await api.create(request(newStudent(), options));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'INVALID_ORIGIN' });
  }
  assert.equal(db.state.users.length, 7);
});

test('the acting administrator is re-read inside the transaction: a principal demoted meanwhile cannot create an ADMIN', async () => {
  const db = world();
  // Guards see a principal (stale view); the row inside the locked transaction is no longer principal.
  const staleGuards = { requireAdmin: async () => ({ user: { id: 'admin1' } }), requirePrincipalAdmin: async () => ({ user: { id: 'admin1' } }) };
  const { factory, calls } = fakeAuthFactory(db);
  const service = core.createUserManagementService(db, staleGuards, factory);
  await assert.rejects(service.create(newAdmin()), error => error.code === 'PRINCIPAL_ADMIN_REQUIRED');
  assert.equal(calls.length, 0); assert.equal(db.state.users.length, 7);
  assert.ok(db.locks >= 1, 'the advisory lock is taken before the re-check');
});

test('role management: only principal admins; principal accounts and self are protected', async () => {
  const body = (role, at = NOW) => ({ role, expectedUpdatedAt: at.toISOString() });
  for (const [actor, status, code] of [[null, 401, 'UNAUTHENTICATED'], ['student1', 403, 'FORBIDDEN'], ['admin1', 403, 'PRINCIPAL_ADMIN_REQUIRED']]) {
    const db = world();
    const response = await routes(db, actor).role(patch('student1', body('admin')), params('student1'));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: code });
    assert.equal(db.state.users.find(row => row.id === 'student1').role, 'STUDENT');
  }
  const db = world();
  const api = routes(db, 'principal1');
  for (const [id, role, status, code] of [
    ['principal2', 'student', 403, 'PROTECTED_ACCOUNT'], ['principal1', 'student', 403, 'PROTECTED_ACCOUNT'],
    ['student1', 'student', 409, 'ROLE_UNCHANGED'], ['student2', 'admin', 422, 'USER_DISABLED'], ['missing', 'admin', 404, 'USER_NOT_FOUND'],
  ]) {
    const response = await api.role(patch(id, body(role)), params(id));
    assert.equal(response.status, status, `${id} -> ${role}`);
    assert.deepEqual(await response.json(), { error: code });
  }
  for (const extra of [{ isPrincipalAdmin: true }, { role: 'ADMIN' }]) {
    const response = await api.role(patch('student1', { ...body('admin'), ...extra }), params('student1'));
    assert.equal(response.status, 400);
  }
  assert.equal(db.state.audit.length, 0);
  assert.deepEqual(db.state.users.filter(row => row.isPrincipalAdmin).map(row => [row.id, row.role]), [['principal1', 'ADMIN'], ['principal2', 'ADMIN'], ['pending', 'ADMIN']]);
});

test('principal promotes a STUDENT and demotes a common ADMIN with optimistic concurrency and audit', async () => {
  const db = world();
  const sessions = structuredClone(db.state.sessions);
  const api = routes(db, 'principal2');
  const stale = await api.role(patch('student1', { role: 'admin', expectedUpdatedAt: '2026-11-18T00:00:00.000Z' }), params('student1'));
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), { error: 'USER_CONFLICT' });

  const promoted = await api.role(patch('student1', { role: 'admin', expectedUpdatedAt: NOW.toISOString() }), params('student1'));
  assert.equal(promoted.status, 200);
  const text = await promoted.text();
  noSecrets(text);
  assert.equal(JSON.parse(text).user.role, 'admin');
  const demoted = await api.role(patch('admin1', { role: 'student', expectedUpdatedAt: NOW.toISOString() }), params('admin1'));
  assert.equal(demoted.status, 200);
  assert.equal((await demoted.json()).user.role, 'student');
  assert.deepEqual(db.state.audit.map(event => [event.action, event.actorId, event.targetUserId, event.previousRole, event.newRole]), [
    ['ROLE_CHANGED', 'principal2', 'student1', 'STUDENT', 'ADMIN'], ['ROLE_CHANGED', 'principal2', 'admin1', 'ADMIN', 'STUDENT'],
  ]);
  assert.equal(db.state.users.find(row => row.id === 'student1').isPrincipalAdmin, false, 'promotion never grants principal status');
  unchangedSessions(db, sessions);
  // The demoted administrator loses access immediately: the role is re-read from the database on every request.
  await assert.rejects(guardsFor(db, 'admin1').requireAdmin(), error => error.code === 'FORBIDDEN');
});

test('user API routes are exactly the approved set, each handler calls its guard explicitly and has no direct DB/env access', () => {
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  const files = walk(path.join(root, 'app/api/admin/users')).map(file => path.relative(root, file).split(path.sep).join('/')).sort();
  assert.deepEqual(files, ['app/api/admin/users/[id]/access/route.ts', 'app/api/admin/users/[id]/role/route.ts', 'app/api/admin/users/route.ts']);
  const guards = { 'app/api/admin/users/route.ts': 'await requireAdmin()', 'app/api/admin/users/[id]/role/route.ts': 'await requirePrincipalAdmin()',
    'app/api/admin/users/[id]/access/route.ts': 'await requireAdmin()', 'app/api/account/password/route.ts': 'await requirePasswordChangeSession()' };
  for (const [file, guard] of Object.entries(guards)) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /export const runtime = "nodejs";/); assert.match(source, /export const dynamic = "force-dynamic";/);
    const handlers = source.match(/export function (?:GET|POST|PUT|PATCH|DELETE)\b[\s\S]*?\n}/g) ?? [];
    assert.ok(handlers.length > 0, file);
    for (const handler of handlers) assert.ok(handler.includes(guard), `${file}: ${guard}`);
    assert.doesNotMatch(source, /prisma|process\.env\.(?!NODE)|password\s*:/i, file);
  }
});

test('the admin user listing never exposes credentials, sessions or audit data', async () => {
  const db = world();
  const read = usersCore.createAdminUsersReader(db, async () => {});
  const result = await read();
  assert.equal(result.kind, 'ready');
  assert.deepEqual(Object.keys(result.users[0]).sort(), ['createdAt', 'disabled', 'email', 'id', 'manualAccess', 'mustChangePassword', 'name', 'paidAccess', 'principal', 'role', 'updatedAt']);
  // Access summaries carry dates, status and the concurrency token only: never who granted, plan, price or payment.
  assert.deepEqual(Object.keys(result.users[0].manualAccess).sort(), ['endsAt', 'firstDay', 'lastDay', 'startsAt', 'status', 'updatedAt']);
  assert.deepEqual(Object.keys(result.users[0].paidAccess).sort(), ['endsAt', 'lastDay', 'status']);
  assert.deepEqual(result.users.filter(row => row.principal).map(row => row.id), ['principal1', 'principal2', 'pending']);
});
