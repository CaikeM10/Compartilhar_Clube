// Provisions ADDITIONAL accounts on a migrated remote database (Neon branch or production):
//
//   node scripts/provision-production-account.cjs admin    -> one more ADMIN (an ADMIN must already exist)
//   node scripts/provision-production-account.cjs student  -> one STUDENT, without subscription, plan or payment
//
// Manual and interactive. Requires explicit authorization before every execution.
// The FIRST administrator is still provisioned only by scripts/provision-production-admin.cjs (unchanged).
//
// Guarantees:
// - Never loads .env files. Connection string, name, e-mail and password are typed in hidden prompts, kept only in
//   memory and never printed, logged, written to disk or passed as arguments. Output: user id and role only.
// - Refuses pooled/local/non-TLS targets; the operator retypes database name and endpoint id (scripts/neon-target.cjs).
// - Creates a NEW account only: an e-mail that exists in any letter case is refused; no existing user is modified
//   (fingerprints of every other user/credential and of plans, subscriptions and payments must be identical).
// - Credentials only through Better Auth (server-side sign-up with the same scrypt hasher, then a real sign-in proof).
//   Public sign-up stays closed in the application; only this process opts in, on its own instance.
// - One PostgreSQL transaction for everything. Better Auth receives only the Prisma interactive-transaction client:
//   its Prisma adapter opens no transaction of its own (adapter option `transaction` is off and the client has no
//   $transaction), so every Better Auth write is part of this transaction or fails. Checked at runtime and pinned by
//   tests/provision-account.test.cjs. Any failure rolls back everything.
// - Advisory lock shared with the first-admin script; ADMIN mode requires the operator to confirm the current ADMIN
//   count and fails if it changed (concurrent provisioning).
const { randomBytes } = require('node:crypto');
const { hiddenPrompt, loadAuthFactory } = require('./local-auth-admin.cjs');
const { parseRemoteTarget, confirmTarget, verifyDatabase, assertAuthSchemaReady } = require('./neon-target.cjs');
const { normalizeEmail } = require('./provision-production-admin.cjs');

const MODES = {
  admin: { role: 'ADMIN', passwordMin: 12, label: 'administrador' },
  student: { role: 'STUDENT', passwordMin: 8, label: 'aluno' },
};
const PASSWORD_MAX = 128; // Better Auth default maximum
const LOCK = 61420319; // same advisory lock as scripts/provision-production-admin.cjs

function normalizeName(value) {
  const name = String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ');
  // eslint-disable-next-line no-control-regex
  if (name.length < 2 || name.length > 100 || /[\u0000-\u001f\u007f<>]/.test(name)) throw new Error('NAME_INVALID');
  return name;
}

function assertAccountPassword(mode, password, confirmation) {
  if (password !== confirmation) throw new Error('PASSWORD_CONFIRMATION_MISMATCH');
  if (password.length < MODES[mode].passwordMin || password.length > PASSWORD_MAX) throw new Error('PASSWORD_LENGTH_INVALID');
}

/**
 * Fingerprints of everything this script must not change. md5 of row text only (never returned or logged).
 * `$1` excludes the account being created (empty string before it exists).
 */
const FINGERPRINT_SQL = `SELECT
  (SELECT count(*)::int FROM users WHERE id <> $1) AS users_count,
  (SELECT md5(coalesce(string_agg(md5(row(id, name, email, role, "disabledAt", "emailVerified", image, "createdAt")::text), '' ORDER BY id), '')) FROM users WHERE id <> $1) AS users_fp,
  (SELECT md5(coalesce(string_agg(md5(row(id, "userId", "providerId", "accountId", password)::text), '' ORDER BY id), '')) FROM auth_accounts WHERE "userId" <> $1) AS accounts_fp,
  (SELECT md5(coalesce(string_agg(md5(row(id, name, price, duration)::text), '' ORDER BY id), '')) FROM plans) AS plans_fp,
  (SELECT md5(coalesce(string_agg(md5(row(id, "userId", "planId", status, "startDate", "endDate")::text), '' ORDER BY id), '')) FROM subscriptions) AS subscriptions_fp,
  (SELECT md5(coalesce(string_agg(md5(row(id, "mercadopagoId", email, plan, status, amount)::text), '' ORDER BY id), '')) FROM payments) AS payments_fp`;
async function fingerprints(tx, excludeUserId) {
  const [row] = await tx.$queryRawUnsafe(FINGERPRINT_SQL, excludeUserId);
  return JSON.stringify(row);
}

async function provisionAccount(db, createAuth, { mode, name, email, password, target, expectedAdmins }) {
  const spec = MODES[mode];
  if (!spec) throw new Error('MODE_INVALID');
  return db.$transaction(async tx => {
    // Better Auth must not be able to open a transaction of its own (see header).
    if (typeof tx.$transaction === 'function') throw new Error('TRANSACTION_CLIENT_REQUIRED');
    await verifyDatabase(tx, target);
    await assertAuthSchemaReady(tx);
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK})`);

    const admins = await tx.user.count({ where: { role: 'ADMIN' } });
    if (mode === 'admin') {
      if (admins < 1) throw new Error('FIRST_ADMIN_USE_PROVISION_PRODUCTION_ADMIN');
      if (!Number.isSafeInteger(expectedAdmins) || admins !== expectedAdmins) throw new Error('ADMIN_COUNT_CHANGED_REVIEW_REQUIRED');
    }
    const existing = await tx.user.findMany({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
    if (existing.length) throw new Error('EMAIL_ALREADY_REGISTERED');
    // Legacy payments are keyed by e-mail: a match needs human review before an account is created for it.
    if (await tx.payment.count({ where: { email: { equals: email, mode: 'insensitive' } } })) throw new Error('EXISTING_FINANCIAL_RECORD_REVIEW_REQUIRED');
    const before = await fingerprints(tx, '');

    // Random secret: hashing (scrypt) does not depend on it and no cookie leaves this process.
    const auth = createAuth(tx, { secret: randomBytes(48).toString('base64url'),
      baseURL: 'https://provisioning.invalid', secureCookies: true, allowSignUp: true });
    const created = await auth.api.signUpEmail({ body: { name, email, password } });
    const userId = created?.user?.id;
    if (typeof userId !== 'string' || !userId) throw new Error('SIGN_UP_FAILED');

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, role: true, disabledAt: true } });
    const accounts = await tx.account.findMany({ where: { userId }, select: { providerId: true, accountId: true, password: true } });
    if (user.role !== 'STUDENT' || user.email !== email || user.disabledAt !== null || accounts.length !== 1 ||
        accounts[0].providerId !== 'credential' || accounts[0].accountId !== userId ||
        !accounts[0].password || accounts[0].password === password) {
      throw new Error('ACCOUNT_INVARIANT_FAILED');
    }
    if (await tx.subscription.count({ where: { userId } })) throw new Error('UNEXPECTED_SUBSCRIPTION');

    // End-to-end proof through the production lookup path (same e-mail/password check as /login).
    const signIn = await auth.api.signInEmail({ body: { email, password } });
    if (signIn?.user?.id !== userId) throw new Error('SIGN_IN_CHECK_FAILED');

    // Explicit server-side promotion; never through the public API.
    if (mode === 'admin') await tx.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
    await tx.session.deleteMany({ where: { userId } });

    if (await fingerprints(tx, userId) !== before) throw new Error('OTHER_ACCOUNTS_CHANGED');
    const final = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } });
    if (final.role !== spec.role) throw new Error('ROLE_INVARIANT_FAILED');
    if (await tx.user.count({ where: { role: 'ADMIN' } }) !== admins + (mode === 'admin' ? 1 : 0)) throw new Error('ADMIN_COUNT_INVARIANT_FAILED');
    if (await tx.session.count({ where: { userId } })) throw new Error('SESSION_CLEANUP_FAILED');
    return { id: userId, role: spec.role };
  }, { maxWait: 10000, timeout: 30000 });
}

async function main({
  argv = process.argv, prompt = hiddenPrompt, log = console.log, PrismaClient, createAuth,
  interactive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
} = {}) {
  const mode = argv[2];
  if (!Object.hasOwn(MODES, mode) || argv.length !== 3) throw new Error('USE_ADMIN_OR_STUDENT');
  if (!interactive()) throw new Error('INTERACTIVE_TERMINAL_REQUIRED');
  const spec = MODES[mode];
  const target = parseRemoteTarget(await prompt('Conexao PostgreSQL DIRETA (entrada oculta): '));
  await confirmTarget(target, prompt, log);
  const Client = PrismaClient || require('@prisma/client').PrismaClient;
  const db = new Client({ datasources: { db: { url: target.url } }, log: [] });
  let password = '';
  let confirmation = '';
  try {
    // Read-only checks before asking for any personal data or credential.
    await db.$transaction(async tx => { await verifyDatabase(tx, target); await assertAuthSchemaReady(tx); });
    let expectedAdmins;
    if (mode === 'admin') {
      const admins = await db.user.count({ where: { role: 'ADMIN' } });
      if (admins < 1) throw new Error('FIRST_ADMIN_USE_PROVISION_PRODUCTION_ADMIN');
      log(`Administradores existentes neste banco: ${admins}`);
      expectedAdmins = Number((await prompt('Digite a quantidade atual de administradores para confirmar: ')).trim());
      if (expectedAdmins !== admins) throw new Error('ADMIN_COUNT_NOT_CONFIRMED');
    }
    const name = normalizeName(await prompt(`Nome do ${spec.label} (entrada oculta): `));
    const email = normalizeEmail(await prompt(`E-mail do ${spec.label} (entrada oculta): `));
    password = await prompt(`Senha (${spec.passwordMin}-${PASSWORD_MAX} caracteres, entrada oculta): `);
    confirmation = await prompt('Confirme a senha (entrada oculta): ');
    assertAccountPassword(mode, password, confirmation);
    confirmation = '';
    const go = (await prompt(`Digite PROVISIONAR para criar 1 ${spec.label} (${spec.role}) em ${target.database}: `)).trim();
    if (go !== 'PROVISIONAR') throw new Error('CANCELLED');
    const result = await provisionAccount(db, createAuth || await loadAuthFactory(), { mode, name, email, password, target, expectedAdmins });
    log(`${result.role} provisionado: ${result.id}`);
    if (mode === 'student') log('Sem assinatura, plano ou pagamento: areas de assinante continuam bloqueadas para esta conta.');
    return result;
  } finally {
    password = confirmation = '';
    await db.$disconnect();
  }
}

module.exports = { provisionAccount, normalizeName, assertAccountPassword, main, MODES, FINGERPRINT_SQL };
if (require.main === module) main().catch(error => {
  // Only fixed error codes; never driver messages (may contain connection details or personal data).
  console.error(/^[A-Z_]+$/.test(error.message || '') ? error.message : 'PROVISIONING_FAILED');
  process.exitCode = 1;
});
