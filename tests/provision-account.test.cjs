// No database, no network: additional-account provisioning against in-memory fakes, plus contract checks that pin
// the dependency behaviour the script relies on (Better Auth writes only through the transaction client).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { provisionAccount, normalizeName, assertAccountPassword, main, FINGERPRINT_SQL } = require('../scripts/provision-production-account.cjs');

const root = path.resolve(__dirname, '..');
const target = { database: 'neondb', host: 'ep-x.example.invalid', endpoint: 'ep-x', url: 'postgresql://u@ep-x.example.invalid/neondb?sslmode=require' };
const password = 'synthetic-password-ABC-123';
const AUTH_COLUMNS = ['id', 'name', 'email', 'createdAt', 'emailVerified', 'image', 'role', 'disabledAt', 'updatedAt'];
const ADMIN = { id: 'cadmin1', email: 'primeiro@example.invalid', name: 'Primeiro', role: 'ADMIN' };
const STUDENT = { id: 'cstudent1', email: 'aluna@example.invalid', name: 'Aluna', role: 'STUDENT' };

/** In-memory database: snapshot rollback per transaction and a real mutex for pg_advisory_xact_lock. */
function fakeDb({ users = [ADMIN, STUDENT], accounts, subscriptions = [{ id: 's1', userId: 'cstudent1' }], payments = [], plans = [{ id: 'p1', name: 'mensal' }],
  migrated = true, database = 'neondb', withTransactionMethod = false } = {}) {
  const state = {
    users: users.map(u => ({ disabledAt: null, emailVerified: false, image: null, ...u })),
    accounts: accounts ?? users.map(u => ({ id: `acc-${u.id}`, userId: u.id, providerId: 'credential', accountId: u.id, password: `scrypt$${u.id}` })),
    subscriptions: [...subscriptions], payments: [...payments], plans: [...plans], sessions: [{ id: 'sess-other', userId: 'cstudent1' }],
  };
  let lock = Promise.resolve();
  const insensitive = (value, where) => value.toLowerCase() === where.equals.toLowerCase();
  const db = { state, locksTaken: 0, transactions: 0 };
  const makeTx = (release, rollback) => {
    const tx = {
      $queryRawUnsafe: async (sql, param) => {
        if (/current_database/.test(sql)) return [{ database }];
        if (/information_schema.tables/.test(sql)) return (migrated ? ['users', 'auth_accounts', 'auth_sessions', 'auth_verifications'] : ['users']).map(table_name => ({ table_name }));
        if (/information_schema.columns/.test(sql)) return (migrated ? AUTH_COLUMNS : ['id', 'name', 'email', 'createdAt']).map(column_name => ({ column_name }));
        if (sql === FINGERPRINT_SQL) {
          const others = state.users.filter(u => u.id !== param);
          return [{ users_count: others.length, users_fp: JSON.stringify(others), accounts_fp: JSON.stringify(state.accounts.filter(a => a.userId !== param)),
            plans_fp: JSON.stringify(state.plans), subscriptions_fp: JSON.stringify(state.subscriptions), payments_fp: JSON.stringify(state.payments) }];
        }
        throw new Error('UNEXPECTED_SQL');
      },
      $executeRawUnsafe: async sql => {
        assert.match(sql, /^SELECT pg_advisory_xact_lock\(61420319\)$/);
        db.locksTaken++;
        const previous = lock; let unlock; lock = new Promise(resolve => { unlock = resolve; });
        release.push(unlock);
        await previous;
        // All writes happen after the lock: rolling back restores this point (only this transaction's changes),
        // like PostgreSQL, which never undoes another transaction's commit.
        rollback.snapshot = JSON.stringify(state);
        return 0;
      },
      user: {
        count: async ({ where }) => state.users.filter(u => u.role === where.role).length,
        findMany: async ({ where }) => state.users.filter(u => insensitive(u.email, where.email)).map(({ id }) => ({ id })),
        findUniqueOrThrow: async ({ where }) => { const u = state.users.find(x => x.id === where.id); if (!u) throw new Error('P2025'); return { ...u }; },
        update: async ({ where, data }) => { Object.assign(state.users.find(x => x.id === where.id), data); },
      },
      account: { findMany: async ({ where }) => state.accounts.filter(a => a.userId === where.userId).map(a => ({ ...a })) },
      subscription: { count: async ({ where }) => state.subscriptions.filter(s => s.userId === where.userId).length },
      payment: { count: async ({ where }) => state.payments.filter(p => insensitive(p.email, where.email)).length },
      session: {
        deleteMany: async ({ where }) => { state.sessions = state.sessions.filter(s => s.userId !== where.userId); },
        count: async ({ where }) => state.sessions.filter(s => s.userId === where.userId).length,
      },
    };
    if (withTransactionMethod) tx.$transaction = async () => assert.fail('nested transaction');
    return tx;
  };
  db.$transaction = async (fn, options) => {
    db.transactions++;
    assert.ok(options === undefined || (options.maxWait && options.timeout));
    const release = [];
    const rollback = { snapshot: JSON.stringify(state) };
    try { return await fn(makeTx(release, rollback)); }
    catch (error) { Object.assign(state, JSON.parse(rollback.snapshot)); throw error; }
    finally { release.forEach(unlock => unlock()); } // advisory xact lock ends with the transaction
  };
  db.user = { count: async ({ where }) => state.users.filter(u => u.role === where.role).length };
  db.$disconnect = async () => { db.disconnected = true; };
  return db;
}

/** Fake Better Auth honouring the contract: sign-up only when allowed, role never accepted from input, scrypt hash. */
function fakeAuth(db, { signInFails = false, tamper = null, ids = ['cnew1', 'cnew2'] } = {}) {
  const seen = [];
  const factory = (tx, environment) => {
    seen.push({ environment, tx });
    return { api: {
      signUpEmail: async ({ body }) => {
        if (!environment.allowSignUp) throw new Error('EMAIL_PASSWORD_SIGN_UP_DISABLED');
        assert.deepEqual(Object.keys(body).sort(), ['email', 'name', 'password']);
        if (db.state.users.some(u => u.email === body.email)) throw new Error('P2002'); // users.email @unique
        const id = ids.shift();
        db.state.users.push({ id, email: body.email, name: body.name, role: 'STUDENT', disabledAt: null, emailVerified: false, image: null });
        db.state.accounts.push({ id: `acc-${id}`, userId: id, providerId: 'credential', accountId: id, password: 'scrypt$salt$hash' });
        db.state.sessions.push({ id: `s-${id}`, userId: id });
        tamper?.(db.state);
        return { user: { id } };
      },
      signInEmail: async ({ body }) => {
        if (signInFails) throw new Error('INVALID_EMAIL_OR_PASSWORD');
        const user = db.state.users.find(u => u.email === body.email);
        assert.equal(body.password, password);
        db.state.sessions.push({ id: `s2-${user.id}`, userId: user.id });
        return { user: { id: user.id } };
      },
    } };
  };
  return { factory, seen };
}
const input = (mode, extra = {}) => ({ mode, name: 'Pessoa Nova', email: 'nova@example.invalid', password, target, expectedAdmins: mode === 'admin' ? 1 : undefined, ...extra });

test('admin: creates a NEW account through Better Auth, proves sign-in, promotes it; nobody else changes', async () => {
  const db = fakeDb();
  const before = JSON.stringify({ users: db.state.users, accounts: db.state.accounts, subscriptions: db.state.subscriptions, payments: db.state.payments, plans: db.state.plans });
  const { factory, seen } = fakeAuth(db);
  assert.deepEqual(await provisionAccount(db, factory, input('admin')), { id: 'cnew1', role: 'ADMIN' });
  assert.equal(seen[0].environment.allowSignUp, true);
  assert.equal(seen[0].environment.baseURL, 'https://provisioning.invalid');
  assert.equal(db.state.users.filter(u => u.role === 'ADMIN').length, 2);
  assert.equal(db.state.users.find(u => u.id === 'cnew1').role, 'ADMIN');
  assert.equal(db.state.sessions.filter(s => s.userId === 'cnew1').length, 0, 'proof sessions removed');
  assert.ok(db.state.sessions.some(s => s.id === 'sess-other'), 'other sessions untouched');
  const after = JSON.parse(JSON.stringify({ users: db.state.users.filter(u => u.id !== 'cnew1'), accounts: db.state.accounts.filter(a => a.userId !== 'cnew1'),
    subscriptions: db.state.subscriptions, payments: db.state.payments, plans: db.state.plans }));
  assert.deepEqual(after, JSON.parse(before));
});

test('student: STUDENT without subscription, plan or payment; no promotion', async () => {
  const db = fakeDb();
  const counts = () => [db.state.subscriptions.length, db.state.payments.length, db.state.plans.length];
  const before = counts();
  assert.deepEqual(await provisionAccount(db, fakeAuth(db).factory, input('student')), { id: 'cnew1', role: 'STUDENT' });
  assert.equal(db.state.users.find(u => u.id === 'cnew1').role, 'STUDENT');
  assert.equal(db.state.users.filter(u => u.role === 'ADMIN').length, 1);
  assert.deepEqual(counts(), before);
});

test('duplicate e-mail in any letter case is refused before Better Auth runs; nothing written', async () => {
  for (const mode of ['admin', 'student']) {
    for (const email of ['aluna@example.invalid', 'primeiro@example.invalid']) {
      const db = fakeDb({ users: [ADMIN, { ...STUDENT, email: 'Aluna@Example.INVALID' }] });
      const before = JSON.stringify(db.state);
      await assert.rejects(provisionAccount(db, () => assert.fail('Better Auth must not run'), input(mode, { email })), /EMAIL_ALREADY_REGISTERED/);
      assert.equal(JSON.stringify(db.state), before);
    }
  }
});

test('student e-mail with legacy payments requires human review; nothing written', async () => {
  const db = fakeDb({ payments: [{ id: 'pay1', email: 'Nova@example.invalid' }] });
  const before = JSON.stringify(db.state);
  await assert.rejects(provisionAccount(db, () => assert.fail('Better Auth must not run'), input('student')), /EXISTING_FINANCIAL_RECORD_REVIEW_REQUIRED/);
  assert.equal(JSON.stringify(db.state), before);
});

test('admin mode: needs an existing ADMIN and the confirmed count; refuses before any write otherwise', async () => {
  const never = () => assert.fail('Better Auth must not run');
  await assert.rejects(provisionAccount(fakeDb({ users: [STUDENT] }), never, input('admin', { expectedAdmins: 0 })), /FIRST_ADMIN_USE_PROVISION_PRODUCTION_ADMIN/);
  await assert.rejects(provisionAccount(fakeDb(), never, input('admin', { expectedAdmins: 2 })), /ADMIN_COUNT_CHANGED_REVIEW_REQUIRED/);
  await assert.rejects(provisionAccount(fakeDb(), never, input('admin', { expectedAdmins: undefined })), /ADMIN_COUNT_CHANGED_REVIEW_REQUIRED/);
  await assert.rejects(provisionAccount(fakeDb({ migrated: false }), never, input('admin')), /AUTH_SCHEMA_NOT_MIGRATED/);
  await assert.rejects(provisionAccount(fakeDb({ database: 'other' }), never, input('student')), /TARGET_DATABASE_MISMATCH/);
  await assert.rejects(provisionAccount(fakeDb(), never, input('owner')), /MODE_INVALID/);
});

test('rollback: failed sign-in proof, unexpected side effects or tampering leave the database exactly as before', async () => {
  const scenarios = [
    [{ signInFails: true }, /INVALID_EMAIL_OR_PASSWORD/],
    [{ tamper: state => { state.users.find(u => u.id === 'cstudent1').role = 'ADMIN'; } }, /OTHER_ACCOUNTS_CHANGED|ADMIN_COUNT_INVARIANT_FAILED/],
    [{ tamper: state => { state.subscriptions.push({ id: 's-x', userId: 'cnew1' }); } }, /UNEXPECTED_SUBSCRIPTION/],
    [{ tamper: state => { state.accounts.find(a => a.userId === 'cadmin1').password = 'changed'; } }, /OTHER_ACCOUNTS_CHANGED/],
    [{ tamper: state => { state.payments.push({ id: 'pay-x', email: 'x@example.invalid' }); } }, /OTHER_ACCOUNTS_CHANGED/],
    [{ tamper: state => { state.users.find(u => u.id === 'cnew1').role = 'ADMIN'; } }, /ACCOUNT_INVARIANT_FAILED/],
    [{ tamper: state => { state.accounts.find(a => a.userId === 'cnew1').password = password; } }, /ACCOUNT_INVARIANT_FAILED/],
  ];
  for (const mode of ['admin', 'student']) {
    for (const [options, error] of scenarios) {
      const db = fakeDb();
      const before = JSON.stringify(db.state);
      await assert.rejects(provisionAccount(db, fakeAuth(db, options).factory, input(mode)), error, `${mode} ${error}`);
      assert.equal(JSON.stringify(db.state), before, `${mode} ${error}: full rollback`);
    }
  }
});

test('transaction guarantee: refuses a client that could open its own transaction; Better Auth gets only the tx client', async () => {
  const db = fakeDb({ withTransactionMethod: true });
  const before = JSON.stringify(db.state);
  await assert.rejects(provisionAccount(db, () => assert.fail('Better Auth must not run'), input('student')), /TRANSACTION_CLIENT_REQUIRED/);
  assert.equal(JSON.stringify(db.state), before);
  const ok = fakeDb();
  const { factory, seen } = fakeAuth(ok);
  await provisionAccount(ok, factory, input('student'));
  assert.equal(typeof seen[0].tx.$transaction, 'undefined');
  assert.equal(ok.transactions, 1);
});

test('concurrency: the advisory lock serializes runs — same e-mail twice yields one account; a second admin run sees the changed count', async () => {
  const db = fakeDb();
  const { factory } = fakeAuth(db);
  const results = await Promise.allSettled([provisionAccount(db, factory, input('student')), provisionAccount(db, factory, input('student'))]);
  assert.deepEqual(results.map(r => r.status).sort(), ['fulfilled', 'rejected']);
  assert.match(results.find(r => r.status === 'rejected').reason.message, /EMAIL_ALREADY_REGISTERED/);
  assert.equal(db.state.users.filter(u => u.email === 'nova@example.invalid').length, 1);

  const admins = fakeDb();
  const auth = fakeAuth(admins);
  const both = await Promise.allSettled([provisionAccount(admins, auth.factory, input('admin', { email: 'a1@example.invalid' })),
    provisionAccount(admins, auth.factory, input('admin', { email: 'a2@example.invalid' }))]);
  assert.deepEqual(both.map(r => r.status).sort(), ['fulfilled', 'rejected']);
  assert.match(both.find(r => r.status === 'rejected').reason.message, /ADMIN_COUNT_CHANGED_REVIEW_REQUIRED/);
  assert.equal(admins.state.users.filter(u => u.role === 'ADMIN').length, 2);
  assert.equal(admins.locksTaken, 2);
});

test('CLI: interactive only, two modes, confirmations; output never contains credentials or personal data', async () => {
  await assert.rejects(main({ argv: ['node', 'x', 'owner'] }), /USE_ADMIN_OR_STUDENT/);
  await assert.rejects(main({ argv: ['node', 'x', 'admin', '--email=a@b.c'] }), /USE_ADMIN_OR_STUDENT/);
  await assert.rejects(main({ argv: ['node', 'x', 'admin'], interactive: () => false }), /INTERACTIVE_TERMINAL_REQUIRED/);

  const secretUrl = 'postgresql://neonuser:SUPER-SECRET-PW@ep-abc-1.sa-east-1.aws.neon.tech/neondb?sslmode=require';
  const run = async (mode, answers) => {
    const lines = [];
    const db = fakeDb();
    const { factory } = fakeAuth(db);
    const errors = [];
    const original = console.error;
    console.error = (...args) => errors.push(args.join(' '));
    try {
      const result = await main({ argv: ['node', 'x', mode], interactive: () => true, log: line => lines.push(line),
        prompt: async () => answers.shift(), PrismaClient: function Client() { return db; }, createAuth: factory });
      return { result, output: [...lines, ...errors].join('\n'), db };
    } catch (error) {
      return { error, output: [...lines, ...errors].join('\n'), db };
    } finally { console.error = original; }
  };
  const admin = await run('admin', [secretUrl, 'neondb', 'ep-abc-1', '1', 'Maria Exemplo', 'Maria@Exemplo.invalid', password, password, 'PROVISIONAR']);
  assert.deepEqual(admin.result, { id: 'cnew1', role: 'ADMIN' });
  assert.equal(admin.db.state.users.find(u => u.id === 'cnew1').email, 'maria@exemplo.invalid');
  assert.ok(admin.db.disconnected);
  const student = await run('student', [secretUrl, 'neondb', 'ep-abc-1', 'Joao Exemplo', 'joao@exemplo.invalid', password, password, 'PROVISIONAR']);
  assert.deepEqual(student.result, { id: 'cnew1', role: 'STUDENT' });
  for (const { output } of [admin, student]) {
    assert.doesNotMatch(output, /SUPER-SECRET-PW|neonuser|synthetic-password|scrypt|Maria|maria@|Joao|joao@/i);
  }
  assert.match(student.output, /Sem assinatura, plano ou pagamento/);

  const cancelled = await run('student', [secretUrl, 'neondb', 'ep-abc-1', 'Joao Exemplo', 'joao@exemplo.invalid', password, password, 'sim']);
  assert.match(cancelled.error.message, /CANCELLED/);
  assert.equal(cancelled.db.state.users.length, 2, 'nothing created without PROVISIONAR');
  const wrongCount = await run('admin', [secretUrl, 'neondb', 'ep-abc-1', '2']);
  assert.match(wrongCount.error.message, /ADMIN_COUNT_NOT_CONFIRMED/);
  const mismatch = await run('admin', [secretUrl, 'neondb', 'ep-abc-1', '1', 'Maria Exemplo', 'maria@exemplo.invalid', password, password + 'x']);
  assert.match(mismatch.error.message, /PASSWORD_CONFIRMATION_MISMATCH/);
  const pooled = await run('admin', [secretUrl.replace('ep-abc-1.', 'ep-abc-1-pooler.')]);
  assert.match(pooled.error.message, /USE_DIRECT_CONNECTION/);
  for (const { output } of [cancelled, wrongCount, mismatch, pooled]) assert.doesNotMatch(output, /SUPER-SECRET-PW|synthetic-password/);
});

test('input validation: names, passwords per role', () => {
  assert.equal(normalizeName('  Maria   da  Silva '), 'Maria da Silva');
  for (const bad of ['', 'A', 'x'.repeat(101), 'Nome\u0000', '<script>']) assert.throws(() => normalizeName(bad), /NAME_INVALID/);
  assert.throws(() => assertAccountPassword('admin', 'elevenchars', 'elevenchars'), /PASSWORD_LENGTH_INVALID/);
  assert.doesNotThrow(() => assertAccountPassword('admin', 'twelve-chars', 'twelve-chars'));
  assert.doesNotThrow(() => assertAccountPassword('student', 'eight888', 'eight888'));
  assert.throws(() => assertAccountPassword('student', 'seven77', 'seven77'), /PASSWORD_LENGTH_INVALID/);
  assert.throws(() => assertAccountPassword('student', 'x'.repeat(129), 'x'.repeat(129)), /PASSWORD_LENGTH_INVALID/);
  assert.throws(() => assertAccountPassword('student', password, password + '!'), /PASSWORD_CONFIRMATION_MISMATCH/);
});

test('dependency contract: Better Auth can only write through the transaction client it is given', () => {
  // 1. The application passes the Prisma client straight to the adapter, without enabling adapter transactions.
  const config = fs.readFileSync(path.join(root, 'lib/auth/config.ts'), 'utf8');
  assert.match(config, /database: prismaAdapter\(db, \{ provider: "postgresql" \}\)/);
  assert.doesNotMatch(config, /transaction:/);
  assert.match(config, /disableSignUp: environment\.allowSignUp !== true/);
  // 2. The installed adapter opens its own transaction only when enabled or when the client exposes $transaction.
  const betterAuthRequire = createRequire(require.resolve('better-auth/adapters/prisma'));
  const adapterFile = betterAuthRequire.resolve('@better-auth/prisma-adapter');
  const adapter = fs.readFileSync(adapterFile.replace(/index\.(c?js|mjs)$/, 'index.mjs'), 'utf8');
  assert.match(adapter, /transaction: config\.transaction \?\? false \?/);
  assert.equal((adapter.match(/\$transaction/g) ?? []).length, (adapter.match(/typeof db\.\$transaction !== "function"|db\.\$transaction\(|prisma\.\$transaction\(/g) ?? []).length);
  for (const use of adapter.match(/[^\n]*db\.\$transaction\([^\n]*/g) ?? []) assert.match(use, /inTransaction \|\| typeof db\.\$transaction !== "function" \?/);
  // 3. Prisma 5 removes $transaction from interactive-transaction clients.
  const runtime = fs.readFileSync(require.resolve('@prisma/client/runtime/library.js'), 'utf8');
  assert.ok(runtime.includes('["$connect","$disconnect","$on","$transaction","$use","$extends"]'));
  // 4. Better Auth itself never calls $transaction.
  const dist = path.dirname(path.dirname(require.resolve('better-auth/adapters/prisma')));
  const offenders = [];
  const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.m?js$/.test(entry.name) && fs.readFileSync(file, 'utf8').includes('$transaction')) offenders.push(path.relative(dist, file));
  } };
  walk(dist);
  assert.deepEqual(offenders, []);
});

test('the first-admin script is preserved and still refuses when an ADMIN exists', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/provision-production-admin.cjs'), 'utf8');
  assert.match(source, /if \(await tx\.user\.count\(\{ where: \{ role: 'ADMIN' \} \}\)\) throw new Error\('ADMIN_ALREADY_EXISTS'\);/);
  const account = fs.readFileSync(path.join(root, 'scripts/provision-production-account.cjs'), 'utf8');
  assert.doesNotMatch(account, /dotenv|process\.env\.DATABASE_URL|writeFileSync|\.subscription\.create|\.payment\.create|\.plan\.create/);
});
