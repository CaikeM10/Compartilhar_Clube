// Rehearsal of scripts/provision-production-account.cjs on a DISPOSABLE Neon branch created from production.
//   node scripts/neon-account-rehearsal.cjs
// Interactive, operator-run. NEVER for the production branch.
//
// Before any write (fail closed):
//   - branch name is not production/main/prod/master; the PRODUCTION endpoint id (from the Neon console) is typed and
//     must differ from the target endpoint; direct connection with sslmode=require&sslaccept=strict; database name
//     and endpoint retyped;
//   - client-side TLS proof (scripts/neon-tls.cjs): verified handshake on the target host and plaintext refused;
//   - read-only identity checks: database, schema public, session transport (pg_stat_ssl: TLS, or the Neon proxy
//     hop from a private peer), writable primary (not a replica), Neon server, auth schema migrated;
//   - the operator types ENSAIO after reviewing the evidence.
// Then, with fictitious identities and random passwords generated in memory (never printed or stored):
//   rollback scenarios (injected failures, transaction timeout, killed process), duplicate e-mails, concurrent runs,
//   creation of ONE fictitious ADMIN and ONE fictitious STUDENT (no subscription, plan or payment), real Better Auth
//   sign-in, permissions through the real guards with a real session cookie, and proof that every pre-existing user,
//   credential, plan, subscription and payment is unchanged.
// Output: codes, counts and booleans only → docs/producao-migracao/resultados/ensaio-contas-neon-<date>.json
const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const ts = require('typescript');
const { hiddenPrompt, loadAuthFactory } = require('./local-auth-admin.cjs');
const { parseRemoteTarget, confirmTarget, verifyDatabase, assertAuthSchemaReady } = require('./neon-target.cjs');
const { assertRehearsalBranch } = require('./neon-branch-smoke.cjs');
const { provisionAccount } = require('./provision-production-account.cjs');
const { assertStrictTlsUrl, proveClientTls, interpretSessionTransport, SESSION_TRANSPORT_SQL } = require('./neon-tls.cjs');

const root = path.resolve(__dirname, '..');
const LOCK = 61420319;
const codeOf = error => error?.body?.code || (/^[A-Z0-9_]+$/.test(error?.message || '') ? error.message : (error?.code || 'UNEXPECTED_ERROR'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Loads a TypeScript module like the offline tests do (server-only stripped, explicit imports). */
function loadTs(file, overrides = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace('import "server-only";', '');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(name => Object.hasOwn(overrides, name) ? overrides[name] : require(name), module, module.exports);
  return module.exports;
}

// ---------------------------------------------------------------------------------------------
// Isolation evidence (read only). Throws before anything is written.
// ---------------------------------------------------------------------------------------------
// TLS: pg_stat_ssl describes only the Neon proxy→compute hop (ssl = false there). The client→Neon leg is proven
// first, from the client side, by proveClientTls (strict driver policy + verified handshake + plaintext refusal);
// see scripts/neon-tls.cjs. Any failure throws before the first SQL statement.
async function assertIsolatedTarget(db, target, { branch, productionEndpoint, proveTls = proveClientTls }) {
  const branchName = assertRehearsalBranch(branch);
  const production = String(productionEndpoint || '').trim();
  if (!/^ep-[a-z0-9-]+$/.test(production)) throw new Error('PRODUCTION_ENDPOINT_ID_INVALID');
  if (production === target.endpoint || target.endpoint.startsWith(`${production}-`)) throw new Error('TARGET_IS_PRODUCTION_ENDPOINT');
  assertStrictTlsUrl(target.url);
  const client = await proveTls(target);
  if (client?.plaintextRefused !== true || client?.handshake?.certificateVerified !== true) throw new Error('TARGET_TLS_NOT_ACTIVE');
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await verifyDatabase(tx, target);
    await assertAuthSchemaReady(tx);
    const [identity] = await tx.$queryRawUnsafe(`SELECT current_schema() AS schema, pg_is_in_recovery() AS replica,
      current_setting('server_version') AS version,
      ${SESSION_TRANSPORT_SQL},
      (SELECT count(*)::int FROM pg_settings WHERE name LIKE 'neon.%') AS neon_settings`);
    if (identity.schema !== 'public') throw new Error('TARGET_SCHEMA_NOT_PUBLIC');
    if (identity.replica !== false) throw new Error('TARGET_IS_READ_REPLICA');
    if (!(identity.neon_settings > 0)) throw new Error('TARGET_NOT_NEON');
    const session = interpretSessionTransport({ ssl: identity.server_side_ssl, peer: identity.server_side_peer, neonServer: true });
    return { branch: branchName, endpoint: target.endpoint, productionEndpointDiffers: true, database: target.database,
      schema: identity.schema, tls: { client, session }, writablePrimary: !identity.replica, postgres: identity.version, neonServer: true };
  }, { maxWait: 10000, timeout: 20000 });
}

// ---------------------------------------------------------------------------------------------
// State of everything that must not change. Hashes stay in memory; the report only says "identical".
// ---------------------------------------------------------------------------------------------
const PRESERVED_SQL = `SELECT
  (SELECT count(*)::int FROM users) AS users, (SELECT count(*)::int FROM users WHERE role = 'ADMIN') AS admins,
  (SELECT count(*)::int FROM auth_accounts) AS accounts, (SELECT count(*)::int FROM plans) AS plans,
  (SELECT count(*)::int FROM subscriptions) AS subscriptions, (SELECT count(*)::int FROM payments) AS payments,
  (SELECT count(*)::int FROM auth_sessions WHERE "userId" = ANY($1::text[])) AS preexisting_sessions,
  (SELECT md5(coalesce(string_agg(md5(row(id, name, email, role, "disabledAt", "emailVerified", image, "createdAt", "updatedAt")::text), '' ORDER BY id), '')) FROM users WHERE id = ANY($1::text[])) AS users_fp,
  (SELECT md5(coalesce(string_agg(md5(row(id, "userId", "providerId", "accountId", password, "updatedAt")::text), '' ORDER BY id), '')) FROM auth_accounts WHERE "userId" = ANY($1::text[])) AS accounts_fp,
  (SELECT md5(coalesce(string_agg(md5(p::text), '' ORDER BY id), '')) FROM plans p) AS plans_fp,
  (SELECT md5(coalesce(string_agg(md5(s::text), '' ORDER BY id), '')) FROM subscriptions s) AS subscriptions_fp,
  (SELECT md5(coalesce(string_agg(md5(p::text), '' ORDER BY id), '')) FROM payments p) AS payments_fp`;
async function preserved(db, ids) { const [row] = await db.$queryRawUnsafe(PRESERVED_SQL, ids); return row; }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Wraps a Better Auth factory to inject a failure into the API, inside the provisioning transaction. */
const injectAuth = (createAuth, change) => (client, environment) => {
  const auth = createAuth(client, environment);
  return { ...auth, api: { ...auth.api, ...change(auth.api) } };
};
/** Wraps the database so the provisioning transaction client fails at a chosen model method. */
const injectTx = (db, model, method, code) => ({
  $transaction: (fn, options) => db.$transaction(tx => fn(new Proxy(tx, { get(target, key) {
    if (key === model) return new Proxy(target[model], { get(delegate, name) {
      if (name === method) return async () => { throw new Error(code); };
      const value = delegate[name]; return typeof value === 'function' ? value.bind(delegate) : value;
    } });
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } })), options),
});

async function waitForLockRelease(db) {
  for (let i = 0; i < 90; i++) {
    const [row] = await db.$queryRawUnsafe(`SELECT count(*)::int AS held FROM pg_locks WHERE locktype = 'advisory' AND objid = ${LOCK}`);
    if (row.held === 0) return i;
    await sleep(1000);
  }
  throw new Error('ADVISORY_LOCK_NOT_RELEASED');
}

/** Kills a child process mid-transaction (after Better Auth wrote user, credential and session). */
async function killedProcessScenario(target, input) {
  const child = fork(__filename, ['--child'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('CHILD_DID_NOT_REACH_WRITE_POINT')); }, 60000);
    child.on('message', message => {
      if (message === 'written') { child.kill('SIGKILL'); }
      else if (message?.error) { clearTimeout(timer); reject(new Error(`CHILD_${message.error}`)); }
    });
    child.on('exit', (code, signal) => { clearTimeout(timer); resolve({ signal: signal || `exit-${code}` }); });
    // In-memory IPC only: never argv, environment, file or log.
    child.send({ url: target.url, target: { database: target.database, endpoint: target.endpoint, host: target.host }, input });
  });
}
async function childMain() {
  process.once('message', async ({ url, target, input }) => {
    const { PrismaClient } = require('@prisma/client');
    const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
    try {
      const createAuth = injectAuth(await loadAuthFactory(), api => ({
        signInEmail: async args => { const result = await api.signInEmail(args); process.send('written'); await new Promise(() => {}); return result; },
      }));
      await provisionAccount(db, createAuth, { ...input, target });
    } catch (error) { process.send({ error: codeOf(error) }); }
  });
}

// ---------------------------------------------------------------------------------------------
// Rehearsal.
// ---------------------------------------------------------------------------------------------
async function rehearse({ db, db2, target, createAuth, log = () => {} }) {
  const tag = randomBytes(5).toString('hex');
  const identity = role => ({ name: `Ensaio ${role} ${tag}`, email: `ensaio-${role}-${tag}@example.invalid`, password: randomBytes(24).toString('base64url') });
  const admin = identity('admin');
  const student = identity('aluno');
  const scratch = identity('rollback');
  const report = { tests: {} };
  const record = (name, value) => { report.tests[name] = value; log(`${name}: ${JSON.stringify(value)}`); };

  const preexistingIds = (await db.user.findMany({ select: { id: true } })).map(user => user.id);
  const before = await preserved(db, preexistingIds);
  report.preexisting = { users: before.users, admins: before.admins, accounts: before.accounts, plans: before.plans, subscriptions: before.subscriptions, payments: before.payments };
  const unchanged = async () => same(await preserved(db, preexistingIds), before);
  const expectFailure = async (name, run, accept) => {
    let code = 'NO_FAILURE';
    try { await run(); } catch (error) { code = codeOf(error); }
    const intact = await unchanged();
    const leftovers = await db.user.count({ where: { email: { contains: `-${tag}@example.invalid` } } });
    record(name, { code, expected: accept.test(code), databaseIdentical: intact, rehearsalUsersLeft: leftovers });
    if (!accept.test(code) || !intact) throw new Error(`REHEARSAL_STEP_FAILED_${name}`);
  };
  const studentInput = (who, extra = {}) => ({ mode: 'student', ...who, target, ...extra });
  const adminInput = (who, extra = {}) => ({ mode: 'admin', ...who, target, expectedAdmins: before.admins, ...extra });

  // 1. Rollback: failures injected at different points of the single transaction.
  await expectFailure('rollbackSignInProofFails', () => provisionAccount(db, injectAuth(createAuth, () => ({
    signInEmail: async () => { throw new Error('INJECTED_SIGN_IN_FAILURE'); } })), studentInput(scratch)), /^INJECTED_SIGN_IN_FAILURE$/);
  await expectFailure('rollbackAfterBetterAuthWrites', () => provisionAccount(db, injectAuth(createAuth, api => ({
    signInEmail: async args => { await api.signInEmail(args); throw new Error('INJECTED_FAILURE_AFTER_WRITES'); } })), studentInput(scratch)), /^INJECTED_FAILURE_AFTER_WRITES$/);
  await expectFailure('rollbackAfterAdminPromotion', () => provisionAccount(injectTx(db, 'session', 'deleteMany', 'INJECTED_FAILURE_AFTER_PROMOTION'),
    createAuth, adminInput(scratch)), /^INJECTED_FAILURE_AFTER_PROMOTION$/);
  await expectFailure('rollbackTransactionTimeout', () => provisionAccount(db, injectAuth(createAuth, api => ({
    signInEmail: async args => { const result = await api.signInEmail(args); await sleep(35000); return result; } })), studentInput(scratch)), /^(P2028|UNEXPECTED_ERROR|P2034)$/);
  const killed = await killedProcessScenario(target, studentInput(scratch, { target: undefined }));
  const lockWaitSeconds = await waitForLockRelease(db);
  await expectFailure('rollbackKilledProcess', async () => { throw new Error(`KILLED_${String(killed.signal).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`); }, /^KILLED_/);
  report.tests.rollbackKilledProcess.lockReleasedAfterSeconds = lockWaitSeconds;

  // 2. Duplicates against pre-existing accounts (any letter case) — refused before Better Auth runs.
  const existing = await db.user.findFirst({ where: { id: { in: preexistingIds } }, select: { email: true } });
  await expectFailure('duplicatePreexistingEmailUppercase', () => provisionAccount(db, () => { throw new Error('BETTER_AUTH_MUST_NOT_RUN'); },
    studentInput({ ...scratch, email: existing.email.toUpperCase() })), /^EMAIL_ALREADY_REGISTERED$/);
  await expectFailure('adminWithWrongExpectedCount', () => provisionAccount(db, () => { throw new Error('BETTER_AUTH_MUST_NOT_RUN'); },
    adminInput(scratch, { expectedAdmins: before.admins + 1 })), /^ADMIN_COUNT_CHANGED_REVIEW_REQUIRED$/);

  // 3. Concurrency on two connections — these runs create the fictitious STUDENT and ADMIN.
  const students = await Promise.allSettled([provisionAccount(db, createAuth, studentInput(student)), provisionAccount(db2, createAuth, studentInput(student))]);
  record('concurrentSameStudentEmail', { outcomes: students.map(r => r.status === 'fulfilled' ? r.value.role : codeOf(r.reason)).sort() });
  const otherAdmin = identity('admin2');
  const admins = await Promise.allSettled([provisionAccount(db, createAuth, adminInput(admin)), provisionAccount(db2, createAuth, adminInput(otherAdmin))]);
  record('concurrentTwoAdmins', { outcomes: admins.map(r => r.status === 'fulfilled' ? r.value.role : codeOf(r.reason)).sort() });
  const createdStudent = students.find(r => r.status === 'fulfilled')?.value;
  const createdAdmin = admins.find(r => r.status === 'fulfilled')?.value;
  if (!createdStudent || !createdAdmin || students.filter(r => r.status === 'fulfilled').length !== 1 || admins.filter(r => r.status === 'fulfilled').length !== 1) {
    throw new Error('REHEARSAL_STEP_FAILED_CONCURRENCY');
  }
  const adminWho = admins[0].status === 'fulfilled' ? admin : otherAdmin;
  await expectFailure('duplicateNewStudentEmailUppercase', () => provisionAccount(db, () => { throw new Error('BETTER_AUTH_MUST_NOT_RUN'); },
    studentInput({ ...scratch, email: student.email.toUpperCase() })), /^EMAIL_ALREADY_REGISTERED$/);

  // 4. Real Better Auth with the APPLICATION configuration (public sign-up closed) and the real guards.
  const authCore = loadTs('lib/auth/authorization-core.ts');
  const pageCore = loadTs('lib/auth/page-access-core.ts', { './authorization-core': authCore });
  const accountHttp = loadTs('lib/auth/account-http.ts', { './authorization-core': authCore });
  const validation = loadTs('lib/materials/validation.ts');
  const storage = loadTs('lib/storage/private-storage.ts');
  const materials = loadTs('lib/materials/service-core.ts', { './validation': validation, '@/lib/storage/private-storage': storage });
  const app = createAuth(db, { secret: randomBytes(48).toString('base64url'), baseURL: 'https://rehearsal.invalid', secureCookies: true });
  try { await app.api.signUpEmail({ body: { name: 'Publico', email: `ensaio-publico-${tag}@example.invalid`, password: randomBytes(16).toString('hex') } }); record('publicSignUp', 'OPEN'); }
  catch (error) { record('publicSignUp', codeOf(error)); }
  const untouched = new Proxy({}, { get() { throw new Error('MATERIAL_DATA_REACHED'); } });

  const profile = async (who, label) => {
    let wrong;
    try { await app.api.signInEmail({ body: { email: who.email, password: `${who.password}x` } }); wrong = 'ACCEPTED'; } catch (error) { wrong = codeOf(error); }
    const signedIn = await app.api.signInEmail({ body: { email: who.email, password: who.password }, returnHeaders: true });
    const cookie = signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const guards = authCore.createAuthorization(app, db, async () => new Headers({ cookie }));
    const session = await (await accountHttp.handleAccountSession(guards.requireSession)).json();
    const redirects = {};
    const access = pageCore.createPageAccess(guards, destination => { throw Object.assign(new Error('REDIRECT'), { destination }); });
    for (const area of ['account', 'admin', 'subscriber']) {
      try { await access(area); redirects[area] = 'ALLOWED'; } catch (error) { redirects[area] = error.destination ?? codeOf(error); }
    }
    // Material data is never touched: a request that passes the guard reaches the sentinel instead of a table.
    const catalog = require('../lib/materials/catalog.json');
    const service = materials.createMaterialService(untouched, { requireAdmin: guards.requireAdmin, requireActiveSubscription: guards.requireActiveSubscription },
      storage.unconfiguredStorage, { knownCovers: catalog.map(item => item.image) });
    const validMaterial = { title: 'Ensaio', description: null, priceCents: 100, currency: 'BRL', coverImage: catalog[0].image, checkoutUrl: null, isPremium: false, displayOrder: 0 };
    const adminOperations = {};
    for (const [name, run] of Object.entries({ listAdmin: () => service.listAdmin(), create: () => service.create(validMaterial), reorder: () => service.reorder({ order: ['material-initial-001'] }) })) {
      try { await run(); adminOperations[name] = 'ALLOWED'; } catch (error) { adminOperations[name] = error.message === 'MATERIAL_DATA_REACHED' ? 'GUARD_PASSED' : codeOf(error); }
    }
    let library;
    try { await service.listLibrary(); library = 'ALLOWED'; } catch (error) { library = error.message === 'MATERIAL_DATA_REACHED' ? 'GUARD_PASSED' : codeOf(error); }
    record(`login${label}`, { signIn: signedIn.response?.user?.id ? 'OK' : 'FAILED', wrongPassword: wrong, role: session.user?.role, destination: session.destination,
      pages: redirects, adminOperations, subscriberLibrary: library });
  };
  await profile(adminWho, 'Admin');
  await profile(student, 'Student');

  // 5. Final state: pre-existing data identical; exactly two fictitious accounts; no subscription for the student.
  const after = await preserved(db, preexistingIds);
  const studentRow = await db.user.findUnique({ where: { id: createdStudent.id }, select: { role: true, subscriptions: { select: { id: true } } } });
  const adminRow = await db.user.findUnique({ where: { id: createdAdmin.id }, select: { role: true } });
  record('finalState', {
    preexistingUsersIdentical: after.users_fp === before.users_fp, preexistingCredentialsIdentical: after.accounts_fp === before.accounts_fp,
    preexistingSessions: after.preexisting_sessions === before.preexisting_sessions,
    plansIdentical: after.plans_fp === before.plans_fp, subscriptionsIdentical: after.subscriptions_fp === before.subscriptions_fp, paymentsIdentical: after.payments_fp === before.payments_fp,
    usersDelta: after.users - before.users, accountsDelta: after.accounts - before.accounts, adminsDelta: after.admins - before.admins,
    fictitiousAdminRole: adminRow.role, fictitiousStudentRole: studentRow.role, fictitiousStudentSubscriptions: studentRow.subscriptions.length,
    rehearsalUsers: await db.user.count({ where: { email: { contains: `-${tag}@example.invalid` } } }),
  });
  const f = report.tests.finalState;
  const la = report.tests.loginAdmin, ls = report.tests.loginStudent;
  report.pass = f.preexistingUsersIdentical && f.preexistingCredentialsIdentical && f.preexistingSessions && f.plansIdentical && f.subscriptionsIdentical &&
    f.paymentsIdentical && f.usersDelta === 2 && f.accountsDelta === 2 && f.adminsDelta === 1 && f.fictitiousAdminRole === 'ADMIN' &&
    f.fictitiousStudentRole === 'STUDENT' && f.fictitiousStudentSubscriptions === 0 && f.rehearsalUsers === 2 &&
    report.tests.publicSignUp === 'EMAIL_PASSWORD_SIGN_UP_DISABLED' &&
    same(report.tests.concurrentSameStudentEmail.outcomes, ['EMAIL_ALREADY_REGISTERED', 'STUDENT']) &&
    same(report.tests.concurrentTwoAdmins.outcomes, ['ADMIN', 'ADMIN_COUNT_CHANGED_REVIEW_REQUIRED']) &&
    la.signIn === 'OK' && la.wrongPassword === 'INVALID_EMAIL_OR_PASSWORD' && la.role === 'admin' && la.destination === '/admin/dashboard' &&
    la.pages.admin === 'ALLOWED' && la.pages.account === 'ALLOWED' && Object.values(la.adminOperations).every(v => v === 'GUARD_PASSED') &&
    ls.signIn === 'OK' && ls.wrongPassword === 'INVALID_EMAIL_OR_PASSWORD' && ls.role === 'student' && ls.destination === '/aluno/dashboard' &&
    ls.pages.account === 'ALLOWED' && ls.pages.admin === '/login?reason=access-denied' && ls.pages.subscriber === '/aluno/dashboard?access=subscription-required' &&
    Object.values(ls.adminOperations).every(v => v === 'FORBIDDEN') && ls.subscriberLibrary === 'SUBSCRIPTION_REQUIRED';
  return report;
}

async function main({ prompt = hiddenPrompt, log = console.log } = {}) {
  if (process.argv.length !== 2) throw new Error('NO_ARGUMENTS_ACCEPTED');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('INTERACTIVE_TERMINAL_REQUIRED');
  const branch = await prompt('Nome da branch de ENSAIO no Neon (nao production): ');
  const productionEndpoint = await prompt('ID do endpoint da branch PRODUCTION (ep-..., do console Neon): ');
  const target = parseRemoteTarget(await prompt('Conexao DIRETA da branch de ENSAIO (entrada oculta): '));
  await confirmTarget(target, prompt, log);
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: target.url } }, log: [] });
  const db2 = new PrismaClient({ datasources: { db: { url: target.url } }, log: [] });
  try {
    const evidence = await assertIsolatedTarget(db, target, { branch, productionEndpoint });
    log(`Evidencias (somente leitura): ${JSON.stringify(evidence)}`);
    if ((await prompt('Digite ENSAIO para executar as escritas NESTA branch descartavel: ')).trim() !== 'ENSAIO') throw new Error('CANCELLED');
    const report = { at: new Date().toISOString(), evidence, ...(await rehearse({ db, db2, target, createAuth: await loadAuthFactory(), log })) };
    const file = path.join(root, 'docs/producao-migracao/resultados', `ensaio-contas-neon-${report.at.slice(0, 10)}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
    log(`pass: ${report.pass}. Relatorio (sem segredos) em ${path.relative(process.cwd(), file)}`);
    if (!report.pass) process.exitCode = 1;
  } finally { await Promise.all([db.$disconnect(), db2.$disconnect()]); }
}

module.exports = { assertIsolatedTarget, rehearse, injectAuth, injectTx, PRESERVED_SQL };
if (require.main === module) {
  if (process.argv[2] === '--child' && process.send) childMain();
  else main().catch(error => {
    console.error(/^[A-Z0-9_]+$/.test(error.message || '') ? error.message : 'REHEARSAL_FAILED');
    process.exitCode = 1;
  });
}
