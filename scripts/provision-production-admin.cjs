// Provisions the FIRST administrator on a migrated remote database (Neon branch or production).
// Manual, interactive and single-use. Requires explicit authorization before every execution.
//
//   node scripts/provision-production-admin.cjs create         -> new account (e-mail not in users)
//   node scripts/provision-production-admin.cjs link-existing  -> adds a credential to an existing
//                                                                 user, preserving id, subscriptions
//                                                                 and payments
//
// Guarantees:
// - Never loads .env files. Connection string, e-mail and password are typed in hidden prompts,
//   kept only in memory and never printed, logged, written to disk or passed as arguments.
// - Refuses pooled/local/non-TLS targets; operator retypes database name and endpoint id.
// - One transaction with an advisory lock: refuses if any ADMIN exists; any failure rolls back.
// - Never sends `role` to the public API. Public sign-up stays closed in the application; only
//   `create` opts in, server-side, inside this process.
// - Proves Better Auth can sign the account in (same lookup as production) BEFORE promoting it.
// - Prints only the user id. No receipt with production data is stored.
const { randomBytes } = require('node:crypto');
const { hiddenPrompt, loadAuthFactory } = require('./local-auth-admin.cjs');
const { parseRemoteTarget, confirmTarget, verifyDatabase, assertAuthSchemaReady } = require('./neon-target.cjs');

const MODES = ['create', 'link-existing'];
const ADMIN_PASSWORD_MIN = 12;
const PASSWORD_MAX = 128; // Better Auth default maximum

function normalizeEmail(value) {
  const email = String(value || '').trim().normalize('NFC').toLowerCase();
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('EMAIL_INVALID');
  return email;
}

function assertPassword(password, confirmation) {
  if (password !== confirmation) throw new Error('PASSWORD_CONFIRMATION_MISMATCH');
  if (password.length < ADMIN_PASSWORD_MIN || password.length > PASSWORD_MAX) throw new Error('PASSWORD_LENGTH_INVALID');
}

async function provisionAdmin(db, createAuth, { mode, email, password, target }) {
  if (!MODES.includes(mode)) throw new Error('MODE_INVALID');
  return db.$transaction(async tx => {
    await verifyDatabase(tx, target);
    await assertAuthSchemaReady(tx);
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(61420319)');
    if (await tx.user.count({ where: { role: 'ADMIN' } })) throw new Error('ADMIN_ALREADY_EXISTS');

    const matches = await tx.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, disabledAt: true },
    });
    // Random secret: password hashing (scrypt) does not depend on it and no cookie leaves this process.
    const auth = createAuth(tx, { secret: randomBytes(48).toString('base64url'),
      baseURL: 'https://provisioning.invalid', secureCookies: true, allowSignUp: mode === 'create' });

    let userId;
    let subscriptionsBefore = 0;
    if (mode === 'create') {
      if (matches.length) throw new Error('EXISTING_ACCOUNT_USE_LINK_EXISTING');
      const result = await auth.api.signUpEmail({ body: { name: 'Administrador', email, password } });
      userId = result.user.id;
    } else {
      if (matches.length === 0) throw new Error('ACCOUNT_NOT_FOUND');
      if (matches.length > 1) throw new Error('AMBIGUOUS_EMAIL_CASE_REVIEW_REQUIRED');
      const [existing] = matches;
      // Better Auth looks e-mails up in lowercase with exact equality; a mixed-case row could never sign in.
      if (existing.email !== email) throw new Error('STORED_EMAIL_NOT_NORMALIZED');
      if (existing.disabledAt !== null) throw new Error('ACCOUNT_DISABLED');
      if (await tx.account.count({ where: { userId: existing.id } })) throw new Error('ACCOUNT_ALREADY_HAS_CREDENTIALS');
      subscriptionsBefore = await tx.subscription.count({ where: { userId: existing.id } });
      const context = await auth.$context;
      // Same hasher Better Auth uses for sign-up/reset; the legacy users.password is never read or copied.
      const hash = await context.password.hash(password);
      await tx.account.create({ data: { userId: existing.id, providerId: 'credential', accountId: existing.id, password: hash } });
      userId = existing.id;
    }

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId },
      select: { id: true, email: true, role: true, disabledAt: true } });
    const accounts = await tx.account.findMany({ where: { userId },
      select: { providerId: true, accountId: true, password: true } });
    if (user.role !== 'STUDENT' || user.email !== email || user.disabledAt !== null || accounts.length !== 1 ||
        accounts[0].providerId !== 'credential' || accounts[0].accountId !== userId ||
        !accounts[0].password || accounts[0].password === password) {
      throw new Error('ACCOUNT_INVARIANT_FAILED');
    }
    if (mode === 'link-existing' && await tx.subscription.count({ where: { userId } }) !== subscriptionsBefore) {
      throw new Error('SUBSCRIPTION_INVARIANT_FAILED');
    }

    // End-to-end proof through the production lookup path, before any privilege is granted.
    const signIn = await auth.api.signInEmail({ body: { email, password } });
    if (signIn?.user?.id !== userId) throw new Error('SIGN_IN_CHECK_FAILED');

    // Explicit server-side promotion; never through the public API.
    await tx.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
    await tx.session.deleteMany({ where: { userId } });
    if (await tx.user.count({ where: { role: 'ADMIN' } }) !== 1) throw new Error('ADMIN_COUNT_INVARIANT_FAILED');
    return { id: userId, mode };
  }, { maxWait: 10000, timeout: 30000 });
}

async function main({ argv = process.argv, prompt = hiddenPrompt, log = console.log, PrismaClient } = {}) {
  const mode = argv[2];
  if (!MODES.includes(mode) || argv.length !== 3) throw new Error('USE_CREATE_OR_LINK_EXISTING');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('INTERACTIVE_TERMINAL_REQUIRED');
  const target = parseRemoteTarget(await prompt('Conexao PostgreSQL DIRETA (entrada oculta): '));
  await confirmTarget(target, prompt, log);
  const Client = PrismaClient || require('@prisma/client').PrismaClient;
  const db = new Client({ datasources: { db: { url: target.url } }, log: [] });
  let password = '';
  let confirmation = '';
  try {
    // Fail fast (read-only) before asking for credentials.
    await db.$transaction(async tx => { await verifyDatabase(tx, target); await assertAuthSchemaReady(tx); });
    if (await db.user.count({ where: { role: 'ADMIN' } })) throw new Error('ADMIN_ALREADY_EXISTS');
    const email = normalizeEmail(await prompt('E-mail do administrador (entrada oculta): '));
    password = await prompt(`Senha (${ADMIN_PASSWORD_MIN}-${PASSWORD_MAX} caracteres, entrada oculta): `);
    confirmation = await prompt('Confirme a senha (entrada oculta): ');
    assertPassword(password, confirmation);
    confirmation = '';
    const go = (await prompt(`Digite PROVISIONAR para executar "${mode}" em ${target.database}: `)).trim();
    if (go !== 'PROVISIONAR') throw new Error('CANCELLED');
    const result = await provisionAdmin(db, await loadAuthFactory(), { mode, email, password, target });
    log(`ADMIN provisionado (${result.mode}): ${result.id}`);
    return result;
  } finally {
    password = confirmation = '';
    await db.$disconnect();
  }
}

module.exports = { provisionAdmin, normalizeEmail, assertPassword, main, ADMIN_PASSWORD_MIN };
if (require.main === module) main().catch(error => {
  // Only fixed error codes; never driver messages (may contain connection details).
  console.error(/^[A-Z_]+$/.test(error.message || '') ? error.message : 'PROVISIONING_FAILED');
  process.exitCode = 1;
});
