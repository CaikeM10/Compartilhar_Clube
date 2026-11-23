// In-memory only: no PrismaClient, no database, no environment files, no network.
// Manual (administrative) access: the content guard (paid subscription OR valid grant), the date rules, grant/renew/
// revoke through the REAL route handler and the real authorization core, account creation with optional access,
// audit, concurrency, rollback and the independence between grants and the financial model.
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
const userCore = load('lib/admin/user-management-core.ts', {
  '@/lib/auth/authorization-core': authCore, './users-core': usersCore, './user-validation': validation,
  './manual-access-core': accessCore, './manual-access-rules': rules,
});
const lessonCore = load('lib/lessons/service-core.ts', { './validation': load('lib/lessons/validation.ts') });
const lessonHttp = load('lib/lessons/http.ts', { './service-core': lessonCore, '@/lib/auth/authorization-core': authCore });
const usersHttp = load('lib/admin/users-http.ts', {
  '@/lib/auth/authorization-core': authCore, '@/lib/lessons/service-core': lessonCore, '@/lib/lessons/http': lessonHttp,
  './user-validation': validation,
});
const studentAccess = load('lib/student/manual-access-core.ts', { '@/lib/admin/manual-access-rules': rules });

const BASE = 'http://127.0.0.1:3000';
// 2026-11-22 09:00 in Fortaleza.
const NOW = new Date('2026-11-22T12:00:00.000Z');
const DAY = 86400000;
const day = (iso) => rules.dayStart(iso);

// ---------------------------------------------------------------------------------------------------------------
// Date rules
// ---------------------------------------------------------------------------------------------------------------

test('rules: Fortaleza calendar days, exclusive end, 366-day limit and status at exact boundaries', () => {
  assert.equal(rules.fortalezaDay(new Date('2026-11-22T02:59:59.999Z')), '2026-11-21');
  assert.equal(rules.fortalezaDay(new Date('2026-11-22T03:00:00.000Z')), '2026-11-22');
  assert.equal(rules.dayStart('2026-11-22').toISOString(), '2026-11-22T03:00:00.000Z');
  assert.equal(rules.lastDayOf(new Date('2026-12-01T03:00:00.000Z')), '2026-11-30');
  assert.equal(rules.formatDay('2026-02-05'), '05/02/2026');
  assert.equal(rules.isCalendarDay('2026-02-29'), false); assert.equal(rules.isCalendarDay('2028-02-29'), true);
  assert.equal(rules.isCalendarDay('2026-1-05'), false);

  // Grant: from today (Fortaleza), at most 366 inclusive days, start at most 366 days ahead.
  assert.deepEqual(rules.grantPeriod('2026-11-22', '2026-11-22', NOW), { startsAt: day('2026-11-22'), endsAt: day('2026-11-23') });
  assert.equal(rules.grantPeriod('2026-11-21', '2026-12-21', NOW), null, 'start in the past');
  assert.equal(rules.grantPeriod('2026-11-30', '2026-11-29', NOW), null, 'end before start');
  assert.ok(rules.grantPeriod('2026-11-22', '2027-11-22', NOW), '366 days inclusive');
  assert.equal(rules.grantPeriod('2026-11-22', '2027-11-23', NOW), null, '367 days');
  assert.equal(rules.grantPeriod('2027-11-23', '2027-11-30', NOW), null, 'start more than 366 days ahead');
  assert.equal(rules.grantPeriod('2026-11-22', 'not-a-day', NOW), null);
  // A server just after midnight in Fortaleza (still the previous UTC day) accepts the new Fortaleza day.
  assert.ok(rules.grantPeriod('2026-11-22', '2026-11-30', new Date('2026-11-22T03:00:00.000Z')));
  assert.equal(rules.grantPeriod('2026-11-22', '2026-11-30', new Date('2026-11-22T02:59:59.000Z')) !== null, true);

  // Renewal: later last day, at most 366 days of validity from today (or from a scheduled start).
  const grant = { startsAt: day('2026-01-01'), endsAt: day('2026-12-01') };
  assert.deepEqual(rules.renewalEnd('2026-12-31', grant, NOW), { endsAt: day('2027-01-01') });
  assert.equal(rules.renewalEnd('2026-11-30', grant, NOW), null, 'not later than the current last day');
  assert.ok(rules.renewalEnd('2027-11-22', grant, NOW)); assert.equal(rules.renewalEnd('2027-11-23', grant, NOW), null);
  const scheduled = { startsAt: day('2027-01-01'), endsAt: day('2027-02-01') };
  assert.ok(rules.renewalEnd('2028-01-01', scheduled, NOW), '366 days from the scheduled start'); assert.equal(rules.renewalEnd('2028-01-02', scheduled, NOW), null);

  const row = (fields) => ({ startsAt: day('2026-11-01'), endsAt: NOW, revokedAt: null, updatedAt: NOW, ...fields });
  assert.equal(rules.manualAccessStatus(null, NOW), 'none');
  assert.equal(rules.manualAccessStatus(row(), NOW), 'expired', 'endsAt == now has already expired');
  assert.equal(rules.manualAccessStatus(row({ endsAt: new Date(NOW.getTime() + 1) }), NOW), 'active');
  assert.equal(rules.manualAccessStatus(row({ startsAt: new Date(NOW.getTime() + 1), endsAt: new Date(NOW.getTime() + DAY) }), NOW), 'scheduled');
  assert.equal(rules.manualAccessStatus(row({ endsAt: new Date(NOW.getTime() + DAY), revokedAt: NOW }), NOW), 'revoked');
});

test('rules: paid subscription summary joins contiguous periods and never claims access for ended or future ones', () => {
  const sub = (start, end) => ({ startDate: new Date(start), endDate: new Date(end) });
  assert.deepEqual(rules.toPaidAccessView([], 0, NOW), { status: 'none', endsAt: null, lastDay: null });
  assert.deepEqual(rules.toPaidAccessView([], 2, NOW), { status: 'inactive', endsAt: null, lastDay: null });
  // Webhook stacking: the renewal starts exactly at the current end.
  assert.deepEqual(rules.toPaidAccessView([sub('2026-12-20T00:00Z', '2027-01-20T00:00Z'), sub('2026-11-20T00:00Z', '2026-12-20T00:00Z')], 2, NOW),
    { status: 'active', endsAt: '2027-01-20T00:00:00.000Z', lastDay: '2027-01-19' });
  assert.equal(rules.toPaidAccessView([sub('2026-12-01T00:00Z', '2027-01-01T00:00Z')], 1, NOW).status, 'scheduled');
  // A gap is not bridged.
  assert.equal(rules.toPaidAccessView([sub('2026-11-01T00:00Z', '2026-12-01T00:00Z'), sub('2027-02-01T00:00Z', '2027-03-01T00:00Z')], 2, NOW).endsAt,
    '2026-12-01T00:00:00.000Z');
});

// ---------------------------------------------------------------------------------------------------------------
// Content guard: requireActiveSubscription() = paid subscription OR valid manual grant
// ---------------------------------------------------------------------------------------------------------------

const matches = (value, condition) => {
  if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
    if ('lte' in condition && !(value <= condition.lte)) return false;
    if ('gt' in condition && !(value > condition.gt)) return false;
    return true;
  }
  return value === condition;
};

function guardWorld({ user = {}, subscriptions = [], grant = null, grantFails = false } = {}) {
  const queries = [];
  const db = {
    user: { findUnique: async ({ where }) => ({ id: where.id, name: null, email: 'aluno@example.invalid', role: 'STUDENT', disabledAt: null,
      emailVerified: true, createdAt: NOW, isPrincipalAdmin: false, mustChangePassword: false, ...user }) },
    subscription: { findFirst: async ({ where }) => {
      queries.push('subscription');
      return subscriptions.find(row => row.userId === where.userId && row.status === where.status &&
        matches(row.startDate, where.startDate) && matches(row.endDate, where.endDate)) ?? null;
    } },
    manualAccessGrant: { findFirst: async ({ where, select }) => {
      queries.push('grant');
      if (grantFails) throw new Error('relation "manual_access_grants" does not exist');
      assert.deepEqual(select, { id: true, endsAt: true });
      const ok = grant && grant.userId === where.userId && grant.revokedAt === where.revokedAt &&
        matches(grant.startsAt, where.startsAt) && matches(grant.endsAt, where.endsAt);
      return ok ? { id: grant.id, endsAt: grant.endsAt } : null;
    } },
  };
  const auth = { api: { getSession: async () => ({ user: { id: 'u1' }, session: { id: 's1', expiresAt: new Date(NOW.getTime() + 3600000) } }) } };
  return { guards: authCore.createAuthorization(auth, db, async () => new Headers(), () => NOW), queries };
}

const paid = (fields = {}) => ({ id: 'sub1', userId: 'u1', planId: 'p', status: 'active', startDate: day('2026-11-01'), endDate: day('2026-12-01'), ...fields });
const grantRow = (fields = {}) => ({ id: 'g1', userId: 'u1', startsAt: day('2026-11-20'), endsAt: day('2026-12-20'), revokedAt: null, ...fields });

test('guard: paid subscription first; the grant is read only without one and never changes the subscription result', async () => {
  let world = guardWorld({ subscriptions: [paid()], grant: grantRow() });
  let result = await world.guards.requireActiveSubscription();
  assert.equal(result.access.source, 'subscription'); assert.equal(result.subscription.id, 'sub1');
  assert.deepEqual(world.queries, ['subscription'], 'grant not even read when a paid subscription is current');

  // A broken or unmigrated grants table can never block a paying student.
  world = guardWorld({ subscriptions: [paid()], grantFails: true });
  assert.equal((await world.guards.requireActiveSubscription()).access.source, 'subscription');

  // Revoked / expired grant with a paid subscription: still allowed by the subscription.
  world = guardWorld({ subscriptions: [paid()], grant: grantRow({ revokedAt: NOW }) });
  assert.equal((await world.guards.requireActiveSubscription()).access.source, 'subscription');
});

test('guard: a valid grant alone gives access; expired, revoked, scheduled and boundary grants do not', async () => {
  let world = guardWorld({ grant: grantRow() });
  const result = await world.guards.requireActiveSubscription();
  assert.deepEqual(result.access, { source: 'grant', endsAt: day('2026-12-20') });
  assert.equal(result.subscription, null);
  assert.deepEqual(world.queries, ['subscription', 'grant']);
  for (const grant of [grantRow({ revokedAt: NOW }), grantRow({ endsAt: NOW }), grantRow({ endsAt: new Date(NOW.getTime() - 1) }),
    grantRow({ startsAt: new Date(NOW.getTime() + 1) }), grantRow({ userId: 'someone-else' }), null]) {
    world = guardWorld({ grant, subscriptions: [paid({ endDate: NOW }), paid({ status: 'canceled', endDate: day('2027-01-01') })] });
    await assert.rejects(world.guards.requireActiveSubscription(), error => error.code === 'SUBSCRIPTION_REQUIRED' && error.status === 403);
  }
  // Grant table failure without a paid subscription: fails closed (503 upstream), never silently grants or denies as 403.
  world = guardWorld({ grantFails: true });
  await assert.rejects(world.guards.requireActiveSubscription(), error => !(error instanceof authCore.AuthorizationError));
});

test('guard: a grant never bypasses a pending password change, a disabled account or the admin rules', async () => {
  let world = guardWorld({ user: { mustChangePassword: true }, grant: grantRow() });
  await assert.rejects(world.guards.requireActiveSubscription(), error => error.code === 'PASSWORD_CHANGE_REQUIRED');
  assert.deepEqual(world.queries, [], 'no access query before the account checks');
  world = guardWorld({ user: { disabledAt: day('2026-11-01') }, grant: grantRow() });
  await assert.rejects(world.guards.requireActiveSubscription(), error => error.code === 'FORBIDDEN');
  world = guardWorld({ grant: grantRow() });
  await assert.rejects(world.guards.requireAdmin(), error => error.code === 'FORBIDDEN', 'a grant is not an admin role');
});

test('guard: lessons and the materials library accept a student with only a valid grant', async () => {
  const world = guardWorld({ grant: grantRow() });
  const lessons = lessonCore.createLessonService({ lesson: { findMany: async () => [] } }, world.guards);
  assert.deepEqual(await lessons.listPublished(), []);
  const materialCore = load('lib/materials/service-core.ts', { './validation': load('lib/materials/validation.ts'), '@/lib/storage/private-storage': load('lib/storage/private-storage.ts') });
  const materials = materialCore.createMaterialService({ material: { findMany: async () => [{ id: 'a', title: 'A', assets: [] }] } }, world.guards);
  assert.deepEqual(await materials.listLibrary(), [{ id: 'a', title: 'A', hasPdf: false }]);
  const denied = guardWorld({ grant: grantRow({ revokedAt: NOW }) });
  await assert.rejects(lessonCore.createLessonService({}, denied.guards).listPublished(), error => error.code === 'SUBSCRIPTION_REQUIRED');
});

// ---------------------------------------------------------------------------------------------------------------
// Service through the real route handler
// ---------------------------------------------------------------------------------------------------------------

function user(id, fields = {}) {
  return { id, name: `Nome ${id}`, email: `${id}@example.invalid`, role: 'STUDENT', disabledAt: null, emailVerified: true,
    isPrincipalAdmin: false, mustChangePassword: false, createdAt: NOW, updatedAt: NOW, ...fields };
}
const pick = (row, select) => select ? Object.fromEntries(Object.keys(select).filter(key => select[key] === true).map(key => [key, row[key]])) : { ...row };
const insensitive = (value, condition) => typeof condition === 'string' ? value === condition : value.toLowerCase() === condition.equals.toLowerCase();

/** In-memory database: users, credentials, grants, events, subscriptions; snapshot rollback; real advisory-lock mutex. */
function memoryDb({ users, subscriptions = [], grants = [] }) {
  const state = {
    users: users.map(row => ({ ...row })),
    accounts: users.map(row => ({ id: `acc-${row.id}`, userId: row.id, providerId: 'credential', accountId: row.id, password: `scrypt$${row.id}` })),
    sessions: users.map(row => ({ id: `sess-${row.id}`, userId: row.id })),
    subscriptions: subscriptions.map(row => ({ ...row })), payments: [], audit: [],
    grants: grants.map(row => ({ ...row })), events: [],
  };
  const db = { state, failEvent: false, failCreateWith: null, clock: 0 };
  let lock = Promise.resolve();
  const tick = () => new Date(NOW.getTime() + (++db.clock) * 1000);
  const financial = new Proxy({}, { get(_, key) { if (['count', 'findFirst', 'findMany'].includes(key)) return undefined; assert.fail(`Financial write attempted: ${String(key)}`); } });
  const grantWhere = (row, where) => Object.entries(where).every(([key, condition]) =>
    condition instanceof Date ? row[key]?.getTime() === condition.getTime() : row[key] === condition);
  // The rollback snapshot is taken once the advisory lock is held (what the transaction really sees), so a loser
  // rolling back never erases rows the winner committed meanwhile.
  const makeTx = ctx => ({
    $executeRawUnsafe: async sql => {
      assert.match(sql, /^SELECT pg_advisory_xact_lock\(\d+\)$/);
      let release; const previous = lock;
      lock = new Promise(resolve => { release = resolve; });
      await previous; ctx.release = release; ctx.snapshot = structuredClone(state); return 1;
    },
    user: {
      findUnique: async ({ where, select }) => { const row = state.users.find(item => item.id === where.id); return row ? pick(row, select) : null; },
      findUniqueOrThrow: async ({ where, select }) => {
        const row = state.users.find(item => item.id === where.id);
        if (!row) throw new Error('NOT_FOUND');
        if (select?.subscriptions) {
          const mine = state.subscriptions.filter(s => s.userId === row.id);
          const where = select.subscriptions.where;
          return { subscriptions: mine.filter(s => s.status === where.status && s.endDate > where.endDate.gt).map(s => ({ startDate: s.startDate, endDate: s.endDate })),
            _count: { subscriptions: mine.length } };
        }
        return pick(row, select);
      },
      count: async ({ where }) => state.users.filter(row => insensitive(row.email, where.email)).length,
      update: async ({ where, data, select }) => { const row = state.users.find(item => item.id === where.id); Object.assign(row, data, { updatedAt: tick() }); return pick(row, select); },
    },
    account: { findMany: async ({ where, select }) => state.accounts.filter(row => row.userId === where.userId).map(row => pick(row, select)) },
    session: { count: async ({ where }) => state.sessions.filter(row => row.userId === where.userId).length },
    subscription: Object.assign(Object.create(financial), { count: async ({ where }) => state.subscriptions.filter(row => row.userId === where.userId).length }),
    payment: Object.assign(Object.create(financial), { count: async () => 0 }),
    plan: financial,
    adminAuditEvent: { create: async ({ data }) => { state.audit.push({ ...data }); return { id: `audit-${state.audit.length}` }; } },
    manualAccessGrant: {
      findUnique: async ({ where, select }) => { const row = state.grants.find(item => item.userId === where.userId); return row ? pick(row, select) : null; },
      findUniqueOrThrow: async ({ where, select }) => pick(state.grants.find(item => item.userId === where.userId), select),
      create: async ({ data, select }) => {
        if (db.failCreateWith) throw db.failCreateWith;
        if (state.grants.some(row => row.userId === data.userId)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        const row = { id: `grant-${state.grants.length + 1}`, revokedAt: null, revokedById: null, createdAt: NOW, updatedAt: tick(), ...data };
        state.grants.push(row); return pick(row, select);
      },
      updateMany: async ({ where, data }) => {
        const rows = state.grants.filter(row => grantWhere(row, where));
        for (const row of rows) Object.assign(row, data, { updatedAt: tick() });
        return { count: rows.length };
      },
    },
    manualAccessEvent: { create: async ({ data }) => {
      if (db.failEvent) throw new Error('EVENT_WRITE_FAILED');
      state.events.push({ previousStartsAt: null, previousEndsAt: null, newStartsAt: null, newEndsAt: null, ...data });
      return { id: `event-${state.events.length}` };
    } },
  });
  db.$transaction = async fn => {
    const ctx = { release: () => {}, snapshot: structuredClone(state) };
    try { return await fn(makeTx(ctx)); }
    catch (error) { Object.assign(state, ctx.snapshot); throw error; }
    finally { ctx.release(); }
  };
  return db;
}

function guardsFor(db, userId) {
  const auth = { api: { getSession: async () => userId ? { user: { id: userId }, session: { id: 's', expiresAt: new Date(NOW.getTime() + 3600000) } } : null } };
  const authDb = {
    user: { findUnique: async ({ where }) => { const row = db.state.users.find(item => item.id === where.id); return row ? { ...row } : null; } },
    subscription: { findFirst: async ({ where }) => db.state.subscriptions.find(row => row.userId === where.userId && row.status === 'active'
      && row.startDate <= where.startDate.lte && row.endDate > where.endDate.gt) ?? null },
    manualAccessGrant: { findFirst: async ({ where }) => {
      const row = db.state.grants.find(item => item.userId === where.userId && item.revokedAt === null && item.startsAt <= where.startsAt.lte && item.endsAt > where.endsAt.gt);
      return row ? { id: row.id, endsAt: row.endsAt } : null;
    } },
  };
  return authCore.createAuthorization(auth, authDb, async () => new Headers(), () => NOW);
}

function routes(db, actorId) {
  const guards = guardsFor(db, actorId);
  const service = accessCore.createManualAccessService(db, guards, () => NOW);
  const management = userCore.createUserManagementService(db, guards, () => ({ api: { signUpEmail: async ({ body }) => {
    const id = `new-${db.state.users.length + 1}`;
    db.state.users.push(user(id, { name: body.name, email: body.email.toLowerCase(), emailVerified: false }));
    db.state.accounts.push({ id: `acc-${id}`, userId: id, providerId: 'credential', accountId: id, password: `scrypt$hash-${id}` });
    return { token: null, user: { id } };
  } } }), () => NOW);
  const revalidated = [];
  const shared = {
    '@/lib/admin/manual-access': { getManualAccess: () => service },
    '@/lib/admin/user-management': { getUserManagement: () => management },
    '@/lib/admin/users-http': usersHttp,
    '@/lib/auth/config': { readAuthEnvironment: () => ({ baseURL: BASE }) },
    '@/lib/auth/authorization': guards,
    'next/cache': { revalidatePath: target => revalidated.push(target) },
  };
  return {
    access: load('app/api/admin/users/[id]/access/route.ts', shared).POST,
    create: load('app/api/admin/users/route.ts', shared).POST,
    guards, revalidated,
  };
}

const post = (url, body, { origin = BASE, site = 'same-origin' } = {}) => new Request(`${BASE}${url}`, {
  method: 'POST', headers: { origin, 'sec-fetch-site': site, 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const params = id => ({ params: Promise.resolve({ id }) });
async function call(api, id, body, options) {
  const response = await api.access(post(`/api/admin/users/${id}/access`, body, options), params(id));
  return { status: response.status, body: await response.json(), headers: response.headers };
}
const grantBody = (fields = {}) => ({ action: 'grant', startDate: '2026-11-22', endDate: '2026-12-21', expectedUpdatedAt: null, ...fields });

function world(extra = {}) {
  return memoryDb({
    users: [
      user('principal1', { role: 'ADMIN', isPrincipalAdmin: true }),
      user('admin1', { role: 'ADMIN' }),
      user('student1'),
      user('student2'),
      user('disabledStudent', { disabledAt: day('2026-11-01') }),
      user('pendingAdmin', { role: 'ADMIN', mustChangePassword: true }),
      user('disabledAdmin', { role: 'ADMIN', disabledAt: day('2026-11-01') }),
    ],
    ...extra,
  });
}

test('access route: anonymous, students (even subscribed or granted), pending and disabled admins are refused before any write', async () => {
  for (const [actor, status, code] of [[null, 401, 'UNAUTHENTICATED'], ['student1', 403, 'FORBIDDEN'], ['pendingAdmin', 403, 'PASSWORD_CHANGE_REQUIRED'], ['disabledAdmin', 403, 'FORBIDDEN']]) {
    const db = world({ subscriptions: [{ ...paid(), userId: 'student1' }], grants: [{ ...grantRow(), userId: 'student1', grantedById: 'admin1', updatedAt: NOW }] });
    const before = structuredClone(db.state);
    const api = routes(db, actor);
    const result = await call(api, 'student2', grantBody());
    assert.equal(result.status, status); assert.deepEqual(result.body, { error: code });
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(db.state, before); assert.deepEqual(api.revalidated, []);
  }
  // Cross-site and non-JSON requests never reach the service.
  const db = world();
  const api = routes(db, 'admin1');
  assert.equal((await call(api, 'student1', grantBody(), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call(api, 'student1', grantBody(), { site: 'cross-site' })).status, 403);
  assert.equal(db.state.grants.length, 0);
});

test('any ADMIN (common or principal) grants access to a student: audited, no financial record, effective on the next check', async () => {
  for (const actor of ['admin1', 'principal1']) {
    const db = world();
    const api = routes(db, actor);
    await assert.rejects(guardsFor(db, 'student1').requireActiveSubscription(), error => error.code === 'SUBSCRIPTION_REQUIRED');
    const result = await call(api, 'student1', grantBody());
    assert.equal(result.status, 200);
    assert.equal(result.body.access.status, 'active');
    assert.equal(result.body.access.firstDay, '2026-11-22'); assert.equal(result.body.access.lastDay, '2026-12-21');
    assert.deepEqual(result.body.paidAccess, { status: 'none', endsAt: null, lastDay: null });
    assert.doesNotMatch(JSON.stringify(result.body), /grantedBy|admin1|principal1|scrypt|@example/);
    assert.equal(db.state.grants.length, 1);
    assert.equal(db.state.grants[0].grantedById, actor);
    assert.deepEqual(db.state.events.map(e => [e.action, e.actorId, e.targetUserId, e.previousEndsAt, e.newEndsAt?.toISOString()]),
      [['GRANTED', actor, 'student1', null, '2026-12-22T03:00:00.000Z']]);
    assert.equal(db.state.subscriptions.length, 0); assert.equal(db.state.payments.length, 0);
    assert.deepEqual(api.revalidated, ['/admin/usuarios', '/admin/dashboard']);
    const access = await guardsFor(db, 'student1').requireActiveSubscription();
    assert.equal(access.access.source, 'grant');
  }
});

test('grant refusals: already active, admins, disabled students, own account, unknown, invalid periods and malformed bodies', async () => {
  const db = world();
  const api = routes(db, 'admin1');
  assert.equal((await call(api, 'student1', grantBody())).status, 200);
  assert.deepEqual((await call(api, 'student1', grantBody({ expectedUpdatedAt: db.state.grants[0].updatedAt.toISOString() }))).body, { error: 'ACCESS_ALREADY_ACTIVE' });
  const cases = [
    ['principal1', grantBody(), 422, 'ACCESS_TARGET_NOT_STUDENT'],
    ['disabledStudent', grantBody(), 422, 'USER_DISABLED'],
    ['admin1', grantBody(), 403, 'PROTECTED_ACCOUNT'],
    ['ghost', grantBody(), 404, 'USER_NOT_FOUND'],
    ['student2', grantBody({ startDate: '2026-11-21' }), 400, 'INVALID_ACCESS_PERIOD'],
    ['student2', grantBody({ endDate: '2027-11-23' }), 400, 'INVALID_ACCESS_PERIOD'],
    ['student2', grantBody({ endDate: '2026-11-21' }), 400, 'INVALID_ACCESS_PERIOD'],
    ['student2', grantBody({ endDate: '2026-02-30' }), 400, 'INVALID_ACCESS'],
    ['student2', grantBody({ startsAt: '2026-11-22T00:00:00Z' }), 400, 'INVALID_ACCESS'],
    ['student2', grantBody({ grantedById: 'principal1' }), 400, 'INVALID_ACCESS'],
    ['student2', { action: 'extend', endDate: '2026-12-01' }, 400, 'INVALID_ACCESS'],
    ['bad id!', grantBody(), 400, 'INVALID_USER'],
  ];
  for (const [id, body, status, code] of cases) {
    const result = await call(api, id, body);
    assert.equal(result.status, status, `${id} ${JSON.stringify(body)}`); assert.deepEqual(result.body, { error: code });
  }
  assert.equal(db.state.grants.length, 1); assert.equal(db.state.events.length, 1);
});

test('renew and revoke: optimistic concurrency, audit with previous and new period, revocation never touches a paid subscription', async () => {
  const subscription = { ...paid(), id: 'paid-1', userId: 'student1', startDate: day('2026-11-01'), endDate: day('2027-01-01') };
  const db = world({ subscriptions: [subscription] });
  const api = routes(db, 'admin1');
  const granted = await call(api, 'student1', grantBody());
  // Paid subscription still current: the response carries the warning data, nothing financial is written.
  assert.deepEqual(granted.body.paidAccess, { status: 'active', endsAt: '2027-01-01T03:00:00.000Z', lastDay: '2026-12-31' });
  const token = granted.body.access.updatedAt;

  assert.deepEqual((await call(api, 'student1', { action: 'renew', endDate: '2027-01-31', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' })).body, { error: 'ACCESS_CONFLICT' });
  assert.deepEqual((await call(api, 'student1', { action: 'renew', endDate: '2026-12-21', expectedUpdatedAt: token })).body, { error: 'INVALID_ACCESS_PERIOD' });
  assert.deepEqual((await call(api, 'student1', { action: 'renew', endDate: '2027-11-23', expectedUpdatedAt: token })).body, { error: 'INVALID_ACCESS_PERIOD' });
  const renewed = await call(api, 'student1', { action: 'renew', endDate: '2027-01-31', expectedUpdatedAt: token });
  assert.equal(renewed.status, 200); assert.equal(renewed.body.access.lastDay, '2027-01-31');
  // The old token is stale after the renewal.
  assert.deepEqual((await call(api, 'student1', { action: 'revoke', expectedUpdatedAt: token })).body, { error: 'ACCESS_CONFLICT' });

  const revoked = await call(api, 'student1', { action: 'revoke', expectedUpdatedAt: renewed.body.access.updatedAt });
  assert.equal(revoked.status, 200); assert.equal(revoked.body.access.status, 'revoked');
  assert.equal(db.state.grants[0].revokedById, 'admin1');
  assert.deepEqual(db.state.events.map(e => e.action), ['GRANTED', 'RENEWED', 'REVOKED']);
  const [, renewal, revocation] = db.state.events;
  assert.equal(renewal.previousEndsAt.toISOString(), '2026-12-22T03:00:00.000Z'); assert.equal(renewal.newEndsAt.toISOString(), '2027-02-01T03:00:00.000Z');
  assert.equal(revocation.previousEndsAt.toISOString(), '2027-02-01T03:00:00.000Z'); assert.equal(revocation.newEndsAt, null);
  // The paid subscription is untouched and still grants access on its own.
  assert.deepEqual(db.state.subscriptions, [subscription]);
  assert.equal((await guardsFor(db, 'student1').requireActiveSubscription()).access.source, 'subscription');
  // Without a subscription, a revoked grant gives nothing.
  db.state.subscriptions = [];
  await assert.rejects(guardsFor(db, 'student1').requireActiveSubscription(), error => error.code === 'SUBSCRIPTION_REQUIRED');
  // Renew / revoke need a live grant.
  assert.deepEqual((await call(api, 'student1', { action: 'revoke', expectedUpdatedAt: revoked.body.access.updatedAt })).body, { error: 'ACCESS_NOT_ACTIVE' });
  assert.deepEqual((await call(api, 'student2', { action: 'renew', endDate: '2026-12-31', expectedUpdatedAt: NOW.toISOString() })).body, { error: 'ACCESS_NOT_ACTIVE' });
});

test('a revoked or expired grant is granted again on the same row, with the token and previous period audited', async () => {
  const db = world({ grants: [{ id: 'old', userId: 'student1', startsAt: day('2026-10-01'), endsAt: day('2026-11-01'), revokedAt: null, revokedById: null, grantedById: 'principal1', updatedAt: day('2026-10-01') }] });
  const api = routes(db, 'admin1');
  assert.deepEqual((await call(api, 'student1', grantBody())).body, { error: 'ACCESS_CONFLICT' }, 'null token while a row exists');
  const result = await call(api, 'student1', grantBody({ expectedUpdatedAt: day('2026-10-01').toISOString() }));
  assert.equal(result.status, 200); assert.equal(result.body.access.status, 'active');
  assert.equal(db.state.grants.length, 1); assert.equal(db.state.grants[0].grantedById, 'admin1');
  assert.equal(db.state.events[0].action, 'GRANTED');
  assert.equal(db.state.events[0].previousEndsAt.toISOString(), day('2026-11-01').toISOString());
  // A disabled student keeps no live grant through renewals, but can always be revoked.
  db.state.users.find(row => row.id === 'student1').disabledAt = NOW;
  const token = result.body.access.updatedAt;
  assert.deepEqual((await call(api, 'student1', { action: 'renew', endDate: '2027-01-31', expectedUpdatedAt: token })).body, { error: 'USER_DISABLED' });
  assert.equal((await call(api, 'student1', { action: 'revoke', expectedUpdatedAt: token })).status, 200);
});

test('concurrency and rollback: simultaneous grants yield one row; unique conflicts map to 409; a failed audit write leaves nothing', async () => {
  const db = world();
  const [a, b] = await Promise.all([call(routes(db, 'admin1'), 'student1', grantBody()), call(routes(db, 'principal1'), 'student1', grantBody())]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(db.state.grants.length, 1); assert.equal(db.state.events.length, 1);

  const raced = world();
  raced.failCreateWith = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  assert.deepEqual((await call(routes(raced, 'admin1'), 'student1', grantBody())).body, { error: 'ACCESS_CONFLICT' });

  const failing = world();
  failing.failEvent = true;
  const result = await call(routes(failing, 'admin1'), 'student1', grantBody());
  assert.equal(result.status, 503); assert.deepEqual(result.body, { error: 'USERS_UNAVAILABLE' });
  assert.equal(failing.state.grants.length, 0); assert.equal(failing.state.events.length, 0);
});

test('the acting administrator is re-read inside the transaction: demoted or disabled meanwhile cannot change access', async () => {
  const db = world();
  const guards = guardsFor(db, 'admin1');
  const service = accessCore.createManualAccessService(db, { requireAdmin: async () => {
    const actor = await guards.requireAdmin();
    db.state.users.find(row => row.id === 'admin1').role = 'STUDENT';
    return actor;
  } }, () => NOW);
  await assert.rejects(service.change('student1', grantBody()), error => error.code === 'FORBIDDEN');
  assert.equal(db.state.grants.length, 0);
});

// ---------------------------------------------------------------------------------------------------------------
// Account creation with optional access
// ---------------------------------------------------------------------------------------------------------------

const newStudent = (fields = {}) => ({ name: 'Aluna Nova', email: 'aluna.nova@example.invalid', password: 'Inicial-segura-123', role: 'student', ...fields });

test('account creation: optional access for students in the same transaction, audited twice, never for administrators', async () => {
  const db = world();
  const api = routes(db, 'admin1');
  const response = await api.create(post('/api/admin/users', newStudent({ access: { startDate: '2026-11-22', endDate: '2027-02-19' } })));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.user.manualAccess.status, 'active'); assert.equal(body.user.manualAccess.lastDay, '2027-02-19');
  assert.equal(body.user.paidAccess.status, 'none');
  const created = db.state.users.at(-1);
  assert.equal(created.mustChangePassword, true);
  assert.deepEqual(db.state.audit.map(e => [e.action, e.actorId, e.targetUserId]), [['USER_CREATED', 'admin1', created.id]]);
  assert.deepEqual(db.state.events.map(e => [e.action, e.actorId, e.targetUserId]), [['GRANTED', 'admin1', created.id]]);
  assert.equal(db.state.subscriptions.length, 0);
  // Pending password change still blocks the contents even with the grant.
  await assert.rejects(guardsFor(db, created.id).requireActiveSubscription(), error => error.code === 'PASSWORD_CHANGE_REQUIRED');
  created.mustChangePassword = false;
  assert.equal((await guardsFor(db, created.id).requireActiveSubscription()).access.source, 'grant');

  // Without access: unchanged behaviour.
  const plain = await api.create(post('/api/admin/users', newStudent({ email: 'outra@example.invalid' })));
  assert.equal(plain.status, 201); assert.equal((await plain.json()).user.manualAccess.status, 'none');
  assert.equal(db.state.grants.length, 1);
});

test('account creation refusals: access for an admin, invalid period, malformed access; a failed grant rolls the account back', async () => {
  const db = world();
  const principal = routes(db, 'principal1');
  const admin = { name: 'Admin Novo', email: 'admin.novo@example.invalid', password: 'Admin-inicial-1234', role: 'admin', access: { startDate: '2026-11-22', endDate: '2026-12-01' } };
  for (const [body, code] of [[admin, 'INVALID_ACCESS'],
    [newStudent({ access: { startDate: '2026-11-21', endDate: '2026-12-01' } }), 'INVALID_ACCESS_PERIOD'],
    [newStudent({ access: { startDate: '2026-11-22', endDate: '2027-11-23' } }), 'INVALID_ACCESS_PERIOD'],
    [newStudent({ access: { startDate: '2026-11-22' } }), 'INVALID_ACCESS'],
    [newStudent({ access: { startDate: '2026-11-22', endDate: '2026-12-01', revokedAt: null } }), 'INVALID_ACCESS']]) {
    const response = await principal.create(post('/api/admin/users', body));
    assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: code });
  }
  assert.equal(db.state.users.length, 7); assert.equal(db.state.grants.length, 0);

  db.failEvent = true;
  const response = await principal.create(post('/api/admin/users', newStudent({ access: { startDate: '2026-11-22', endDate: '2026-12-01' } })));
  assert.equal(response.status, 503);
  assert.equal(db.state.users.length, 7); assert.equal(db.state.accounts.length, 7);
  assert.equal(db.state.audit.length, 0); assert.equal(db.state.grants.length, 0);
});

// ---------------------------------------------------------------------------------------------------------------
// Student dashboard reader and static guarantees
// ---------------------------------------------------------------------------------------------------------------

test('student reader: own grant only, from the session; failures are unavailable, authentication errors propagate', async () => {
  const calls = [];
  const db = { manualAccessGrant: { findUnique: async args => { calls.push(args); return { startsAt: day('2026-11-20'), endsAt: day('2026-12-20'), revokedAt: null }; } } };
  const result = await studentAccess.createStudentManualAccessReader(db, async () => ({ user: { id: 'own' } }), () => NOW)();
  assert.deepEqual(result, { kind: 'grant', status: 'active', firstDay: '2026-11-20', lastDay: '2026-12-19' });
  assert.deepEqual(calls, [{ where: { userId: 'own' }, select: { startsAt: true, endsAt: true, revokedAt: true } }]);
  const none = { manualAccessGrant: { findUnique: async () => null } };
  assert.deepEqual(await studentAccess.createStudentManualAccessReader(none, async () => ({ user: { id: 'own' } }))(), { kind: 'none' });
  const broken = { manualAccessGrant: { findUnique: async () => { throw new Error('private driver details'); } } };
  assert.deepEqual(await studentAccess.createStudentManualAccessReader(broken, async () => ({ user: { id: 'own' } }))(), { kind: 'unavailable' });
  const denied = new Error('UNAUTHENTICATED');
  await assert.rejects(studentAccess.createStudentManualAccessReader(new Proxy({}, { get() { assert.fail('db touched'); } }), async () => { throw denied; })(), e => e === denied);
});

test('static: manual access code never writes plans, subscriptions or payments, and the payment webhook does not know about grants', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  for (const file of ['lib/admin/manual-access-core.ts', 'lib/admin/manual-access.ts', 'lib/admin/manual-access-rules.ts', 'lib/admin/user-management-core.ts',
    'app/api/admin/users/[id]/access/route.ts', 'lib/student/manual-access-core.ts', 'components/users/ManualAccessControl.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /\b(?:plan|subscription|payment)\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\b/, file);
    assert.doesNotMatch(source, /process\.env\.(?!NODE)|principal_designation|storageKey/, file);
  }
  for (const file of ['lib/payments/mercado-pago-webhook.ts', 'app/api/webhook/route.ts', 'app/api/create-payment/route.ts']) {
    assert.doesNotMatch(read(file), /manualAccess|manual_access/i, file);
  }
  // The route reads only what the panel sends; the student id comes from the URL and is re-validated by the service.
  const route = read('app/api/admin/users/[id]/access/route.ts');
  assert.match(route, /export const runtime = "nodejs";/); assert.match(route, /export const dynamic = "force-dynamic";/);
  assert.match(route, /export function POST[\s\S]*await requireAdmin\(\)[\s\S]*mutationBody/);
  assert.doesNotMatch(route, /export function (?:GET|PUT|PATCH|DELETE)\b/);
  // The guard keeps its historical name and documents the new meaning.
  const guard = read('lib/auth/authorization-core.ts');
  assert.match(guard, /current PAID subscription OR a valid MANUAL ACCESS GRANT/);
  assert.ok(guard.indexOf('requireSession()', guard.indexOf('async function requireActiveSubscription')) <
    guard.indexOf('db.manualAccessGrant.findFirst'), 'account checks run before the grant query');
});
