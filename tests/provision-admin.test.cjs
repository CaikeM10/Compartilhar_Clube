// No database, no network: provisioning logic against in-memory fakes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { provisionAdmin, normalizeEmail, assertPassword, main } = require('../scripts/provision-production-admin.cjs');
const { parseRemoteTarget, confirmTarget } = require('../scripts/neon-target.cjs');

const target = { database: 'neondb', host: 'ep-x.example.invalid', endpoint: 'ep-x', url: 'postgresql://u@ep-x.example.invalid/neondb?sslmode=require' };
const password = 'synthetic-password-ABC-123';
const AUTH_COLUMNS = ['id', 'name', 'email', 'createdAt', 'emailVerified', 'image', 'role', 'disabledAt', 'updatedAt'];

function fakeDb({ users = [], accounts = [], subscriptions = [], migrated = true, database = 'neondb' } = {}) {
  const state = { users: users.map(u => ({ role: 'STUDENT', disabledAt: null, ...u })), accounts: [...accounts],
    subscriptions: [...subscriptions], sessions: [], locks: 0, committed: false, calls: [] };
  const insensitive = (value, where) => value.toLowerCase() === where.equals.toLowerCase();
  const tx = {
    $queryRawUnsafe: async sql => {
      if (/current_database/.test(sql)) return [{ database }];
      if (/information_schema.tables/.test(sql)) return (migrated ? ['users', 'auth_accounts', 'auth_sessions', 'auth_verifications'] : ['users']).map(table_name => ({ table_name }));
      if (/information_schema.columns/.test(sql)) return (migrated ? AUTH_COLUMNS : ['id', 'name', 'email', 'createdAt']).map(column_name => ({ column_name }));
      throw new Error('UNEXPECTED_SQL');
    },
    $executeRawUnsafe: async sql => { assert.match(sql, /pg_advisory_xact_lock/); state.locks++; return 0; },
    user: {
      count: async ({ where }) => state.users.filter(u => u.role === where.role).length,
      findMany: async ({ where }) => state.users.filter(u => insensitive(u.email, where.email)).map(({ id, email, disabledAt }) => ({ id, email, disabledAt })),
      findUniqueOrThrow: async ({ where }) => { const u = state.users.find(x => x.id === where.id); if (!u) throw new Error('P2025'); return { ...u }; },
      update: async ({ where, data }) => { state.calls.push(['user.update', data]); Object.assign(state.users.find(x => x.id === where.id), data); },
    },
    account: {
      count: async ({ where }) => state.accounts.filter(a => a.userId === where.userId).length,
      create: async ({ data }) => { state.accounts.push(data); return data; },
      findMany: async ({ where }) => state.accounts.filter(a => a.userId === where.userId),
    },
    subscription: { count: async ({ where }) => state.subscriptions.filter(s => s.userId === where.userId).length },
    session: { deleteMany: async ({ where }) => { state.sessions = state.sessions.filter(s => s.userId !== where.userId); } },
  };
  const db = {
    state,
    $transaction: async (fn, options) => {
      // Simulated rollback: snapshot, restore on error.
      const snapshot = JSON.stringify(state);
      try { const result = await fn(tx); state.committed = true; return result; }
      catch (error) { Object.assign(state, JSON.parse(snapshot)); throw error; }
    },
  };
  return db;
}

// Fake Better Auth honouring the contract the script relies on.
function fakeAuthFactory(db, { signInFails = false } = {}) {
  const seen = [];
  const factory = (tx, environment) => {
    seen.push(environment);
    return {
      $context: Promise.resolve({ password: { hash: async value => `scrypt$${Buffer.from(value).toString('hex').length}$opaque` } }),
      api: {
        signUpEmail: async ({ body }) => {
          if (!environment.allowSignUp) throw new Error('EMAIL_PASSWORD_SIGN_UP_DISABLED');
          assert.equal(Object.hasOwn(body, 'role'), false);
          const user = { id: 'cnewadminid', email: body.email.toLowerCase(), name: body.name, role: 'STUDENT', disabledAt: null };
          db.state.users.push(user);
          db.state.accounts.push({ userId: user.id, providerId: 'credential', accountId: user.id, password: 'scrypt$hash' });
          db.state.sessions.push({ userId: user.id });
          return { user: { id: user.id } };
        },
        signInEmail: async ({ body }) => {
          if (signInFails) throw new Error('INVALID_EMAIL_OR_PASSWORD');
          const user = db.state.users.find(u => u.email === body.email.toLowerCase());
          const account = user && db.state.accounts.find(a => a.userId === user.id && a.providerId === 'credential' && a.accountId === user.id);
          if (!account) throw new Error('INVALID_EMAIL_OR_PASSWORD');
          db.state.sessions.push({ userId: user.id });
          return { user: { id: user.id } };
        },
      },
    };
  };
  return { factory, seen };
}

test('create: signs up server-side, proves sign-in, then promotes and clears sessions', async () => {
  const db = fakeDb({ users: [{ id: 'clegacy1', email: 'outra@example.invalid' }] });
  const { factory, seen } = fakeAuthFactory(db);
  const result = await provisionAdmin(db, factory, { mode: 'create', email: 'admin@example.invalid', password, target });
  assert.deepEqual(result, { id: 'cnewadminid', mode: 'create' });
  assert.equal(seen[0].allowSignUp, true);
  assert.equal(db.state.users.find(u => u.id === 'cnewadminid').role, 'ADMIN');
  assert.equal(db.state.users.find(u => u.id === 'clegacy1').role, 'STUDENT');
  assert.equal(db.state.sessions.length, 0);
  assert.equal(db.state.locks, 1);
});

test('create refuses an e-mail that already exists in any letter case (no duplicate user)', async () => {
  const db = fakeDb({ users: [{ id: 'clegacy1', email: 'Admin@Example.invalid' }] });
  await assert.rejects(provisionAdmin(db, fakeAuthFactory(db).factory, { mode: 'create', email: 'admin@example.invalid', password, target }),
    /EXISTING_ACCOUNT_USE_LINK_EXISTING/);
  assert.equal(db.state.users.length, 1);
});

test('link-existing preserves id and subscriptions, adds one credential, never enables sign-up', async () => {
  const db = fakeDb({ users: [{ id: 'clegacy1', email: 'admin@example.invalid', password: 'legacy-unknown-format' }],
    subscriptions: [{ userId: 'clegacy1' }, { userId: 'clegacy1' }] });
  const { factory, seen } = fakeAuthFactory(db);
  const result = await provisionAdmin(db, factory, { mode: 'link-existing', email: 'admin@example.invalid', password, target });
  assert.deepEqual(result, { id: 'clegacy1', mode: 'link-existing' });
  assert.equal(seen[0].allowSignUp, false);
  assert.equal(db.state.users.length, 1);
  assert.equal(db.state.subscriptions.length, 2);
  const [account] = db.state.accounts;
  assert.deepEqual([account.userId, account.providerId, account.accountId], ['clegacy1', 'credential', 'clegacy1']);
  assert.notEqual(account.password, password);
  assert.notEqual(account.password, 'legacy-unknown-format');
  assert.equal(db.state.users[0].password, 'legacy-unknown-format', 'legacy column untouched');
  assert.equal(db.state.users[0].role, 'ADMIN');
});

test('link-existing refuses unsafe states without writing', async () => {
  const cases = [
    [{ users: [] }, /ACCOUNT_NOT_FOUND/],
    [{ users: [{ id: 'a', email: 'Admin@example.invalid' }] }, /STORED_EMAIL_NOT_NORMALIZED/],
    [{ users: [{ id: 'a', email: 'admin@example.invalid' }, { id: 'b', email: 'ADMIN@example.invalid' }] }, /AMBIGUOUS_EMAIL_CASE_REVIEW_REQUIRED/],
    [{ users: [{ id: 'a', email: 'admin@example.invalid', disabledAt: new Date().toISOString() }] }, /ACCOUNT_DISABLED/],
    [{ users: [{ id: 'a', email: 'admin@example.invalid' }], accounts: [{ userId: 'a', providerId: 'credential', accountId: 'a', password: 'x' }] }, /ACCOUNT_ALREADY_HAS_CREDENTIALS/],
  ];
  for (const [seed, error] of cases) {
    const db = fakeDb(seed);
    const before = JSON.stringify(db.state);
    await assert.rejects(provisionAdmin(db, fakeAuthFactory(db).factory, { mode: 'link-existing', email: 'admin@example.invalid', password, target }), error);
    assert.equal(JSON.stringify(db.state), before);
  }
});

test('refuses when an ADMIN exists, schema not migrated or database differs — before Better Auth runs', async () => {
  const never = () => assert.fail('Better Auth must not be invoked');
  await assert.rejects(provisionAdmin(fakeDb({ users: [{ id: 'a', email: 'x@example.invalid', role: 'ADMIN' }] }), never,
    { mode: 'create', email: 'admin@example.invalid', password, target }), /ADMIN_ALREADY_EXISTS/);
  await assert.rejects(provisionAdmin(fakeDb({ migrated: false }), never,
    { mode: 'create', email: 'admin@example.invalid', password, target }), /AUTH_SCHEMA_NOT_MIGRATED/);
  await assert.rejects(provisionAdmin(fakeDb({ database: 'other' }), never,
    { mode: 'create', email: 'admin@example.invalid', password, target }), /TARGET_DATABASE_MISMATCH/);
});

test('no promotion when the sign-in proof fails (whole transaction rolls back)', async () => {
  const db = fakeDb();
  await assert.rejects(provisionAdmin(db, fakeAuthFactory(db, { signInFails: true }).factory,
    { mode: 'create', email: 'admin@example.invalid', password, target }), /INVALID_EMAIL_OR_PASSWORD/);
  assert.equal(db.state.users.length, 0);
  assert.equal(db.state.calls.length, 0);
});

test('remote target: direct TLS connection only; local, pooled and non-TLS refused', () => {
  const ok = parseRemoteTarget('postgresql://u:p@ep-cool-x-123.sa-east-1.aws.neon.tech/neondb?sslmode=require');
  assert.deepEqual([ok.endpoint, ok.database], ['ep-cool-x-123', 'neondb']);
  assert.throws(() => parseRemoteTarget('postgresql://u:p@ep-cool-x-123-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require'), /USE_DIRECT_CONNECTION/);
  assert.throws(() => parseRemoteTarget('postgresql://u:p@127.0.0.1:5432/neondb?sslmode=require'), /MUST_BE_REMOTE/);
  assert.throws(() => parseRemoteTarget('postgresql://u:p@ep-x.neon.tech/neondb'), /SSL_REQUIRED/);
  assert.throws(() => parseRemoteTarget('mysql://u:p@ep-x.neon.tech/neondb?sslmode=require'), /INVALID/);
  assert.throws(() => parseRemoteTarget('postgresql://u:p@ep-x.neon.tech/neondb?sslmode=require&schema=other'), /SCHEMA_MUST_BE_PUBLIC/);
});

test('target confirmation requires retyping database and endpoint; output never contains credentials', async () => {
  const parsed = parseRemoteTarget('postgresql://user:SECRET-PASS@ep-a-1.neon.tech/neondb?sslmode=require');
  const lines = [];
  const answers = ['neondb', 'ep-a-1'];
  await confirmTarget(parsed, async () => answers.shift(), line => lines.push(line));
  assert.doesNotMatch(lines.join('\n'), /SECRET-PASS|user/);
  const wrong = ['neondb', 'ep-other'];
  await assert.rejects(confirmTarget(parsed, async () => wrong.shift(), () => {}), /TARGET_NOT_CONFIRMED/);
});

test('e-mail normalization and password policy', () => {
  assert.equal(normalizeEmail('  Admin@Example.INVALID '), 'admin@example.invalid');
  assert.throws(() => normalizeEmail('not-an-email'), /EMAIL_INVALID/);
  assert.throws(() => assertPassword('short', 'short'), /PASSWORD_LENGTH_INVALID/);
  assert.throws(() => assertPassword(password, password + 'x'), /PASSWORD_CONFIRMATION_MISMATCH/);
  assert.doesNotThrow(() => assertPassword(password, password));
});

test('CLI accepts only the two modes and requires an interactive terminal', async () => {
  await assert.rejects(main({ argv: ['node', 'x', 'delete'] }), /USE_CREATE_OR_LINK_EXISTING/);
  await assert.rejects(main({ argv: ['node', 'x', 'create', '--email=a@b.c'] }), /USE_CREATE_OR_LINK_EXISTING/);
  if (!process.stdin.isTTY) await assert.rejects(main({ argv: ['node', 'x', 'create'] }), /INTERACTIVE_TERMINAL_REQUIRED/);
});
