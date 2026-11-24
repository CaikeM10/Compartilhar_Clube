// Operator procedures for PRINCIPAL administrators (never reachable from the admin panel):
//
//   node scripts/principal-admin-operator.cjs designate [--local]
//       Marks one existing, enabled ADMIN (with a credential) as principal. At most two principals exist.
//   node scripts/principal-admin-operator.cjs recover-password [--local]
//       Administrative recovery that does not depend on any active session: sets a temporary password for one
//       existing ADMIN through Better Auth's hasher, forces a password change at the next login and revokes every
//       session of that account.
//
// Manual and interactive. Requires explicit authorization before every execution and after
// docs/producao-migracao/06-admin-users.sql was applied to the target.
//
// Guarantees:
// - Never loads .env files for remote targets. The connection string, e-mail and password are typed in hidden prompts,
//   kept only in memory and never printed, logged, written or passed as arguments. Output: user id only.
// - Remote: direct Neon connection with verified TLS only (scripts/neon-target.cjs); database and endpoint retyped.
//   --local: only the isolated local test database (scripts/auth-test-safety.cjs), credentials read by that helper.
// - One transaction; advisory lock shared with every account-provisioning path. The operator confirms the current
//   number of principals, which must not change before the write. The database trigger from 06 enforces the limit of
//   two and accepts the change only because this transaction sets compartilhar.principal_designation = 'on' (SET
//   LOCAL semantics: it ends with the transaction).
// - Every other user, credential and session must be identical at the end (fingerprints), otherwise rollback.
// - Audit: PRINCIPAL_DESIGNATED / OPERATOR_PASSWORD_RESET with no panel actor (operator procedure).
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { hiddenPrompt, loadAuthFactory } = require('./local-auth-admin.cjs');
const { parseRemoteTarget, confirmTarget, verifyDatabase, assertAuthSchemaReady } = require('./neon-target.cjs');
const { loadTarget, verifyServer } = require('./auth-test-safety.cjs');
const { normalizeEmail } = require('./provision-production-admin.cjs');

const root = path.resolve(__dirname, '..');
const LOCK = 61420319; // same advisory lock as scripts/provision-production-*.cjs and lib/admin/user-management-core.ts
const PRINCIPAL_LIMIT = 2;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;
const MODES = ['designate', 'recover-password'];

async function assertAdminUsersSchemaReady(tx) {
  await assertAuthSchemaReady(tx);
  const columns = await tx.$queryRawUnsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = ANY($1::text[])",
    ['isPrincipalAdmin', 'mustChangePassword']);
  const [audit] = await tx.$queryRawUnsafe("SELECT to_regclass('public.admin_audit_events') IS NOT NULL AS present");
  if (columns.length !== 2 || audit?.present !== true) throw new Error('ADMIN_USERS_SCHEMA_NOT_MIGRATED');
}

/** md5 of everything that must not change, excluding the target account. Never returned or logged. */
const OTHERS_SQL = `SELECT
  (SELECT md5(coalesce(string_agg(md5(row(id, name, email, role, "disabledAt", "isPrincipalAdmin", "mustChangePassword")::text), '' ORDER BY id), '')) FROM users WHERE id <> $1) AS users_fp,
  (SELECT md5(coalesce(string_agg(md5(row(id, "userId", "providerId", "accountId", password)::text), '' ORDER BY id), '')) FROM auth_accounts WHERE "userId" <> $1) AS accounts_fp,
  (SELECT md5(coalesce(string_agg(md5(row(id, "userId", token)::text), '' ORDER BY id), '')) FROM auth_sessions WHERE "userId" <> $1) AS sessions_fp`;
async function others(tx, userId) { const [row] = await tx.$queryRawUnsafe(OTHERS_SQL, userId); return JSON.stringify(row); }

async function findTarget(tx, email) {
  const users = await tx.user.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true, role: true, disabledAt: true, isPrincipalAdmin: true },
  });
  if (users.length === 0) throw new Error('TARGET_ACCOUNT_NOT_FOUND');
  if (users.length > 1) throw new Error('TARGET_ACCOUNT_AMBIGUOUS');
  const [user] = users;
  if (user.role !== 'ADMIN') throw new Error('TARGET_MUST_BE_ADMIN');
  if (user.disabledAt !== null) throw new Error('TARGET_ACCOUNT_DISABLED');
  const credentials = await tx.account.findMany({ where: { userId: user.id, providerId: 'credential' }, select: { id: true } });
  if (credentials.length !== 1) throw new Error('TARGET_CREDENTIAL_INVALID');
  return { ...user, credentialId: credentials[0].id };
}

async function designatePrincipal(db, { email, expectedPrincipals, verify }) {
  return db.$transaction(async tx => {
    await verify(tx);
    await assertAdminUsersSchemaReady(tx);
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK})`);
    // Transaction-local: the 06 trigger accepts principal changes only inside this procedure.
    await tx.$executeRawUnsafe("SELECT set_config('compartilhar.principal_designation', 'on', true)");
    const principals = await tx.user.count({ where: { isPrincipalAdmin: true } });
    if (principals !== expectedPrincipals) throw new Error('PRINCIPAL_COUNT_CHANGED_REVIEW_REQUIRED');
    if (principals >= PRINCIPAL_LIMIT) throw new Error('PRINCIPAL_ADMIN_LIMIT_REACHED');
    const user = await findTarget(tx, email);
    if (user.isPrincipalAdmin) throw new Error('TARGET_ALREADY_PRINCIPAL');
    const before = await others(tx, user.id);

    await tx.user.update({ where: { id: user.id }, data: { isPrincipalAdmin: true } });
    await tx.adminAuditEvent.create({ data: { action: 'PRINCIPAL_DESIGNATED', actorId: null, targetUserId: user.id } });

    if (await tx.user.count({ where: { isPrincipalAdmin: true } }) !== principals + 1) throw new Error('PRINCIPAL_COUNT_INVARIANT_FAILED');
    if (await others(tx, user.id) !== before) throw new Error('OTHER_ACCOUNTS_CHANGED');
    return { id: user.id, principals: principals + 1 };
  }, { maxWait: 10000, timeout: 30000 });
}

async function recoverAdminPassword(db, createAuth, { email, password, verify }) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) throw new Error('PASSWORD_LENGTH_INVALID');
  return db.$transaction(async tx => {
    if (typeof tx.$transaction === 'function') throw new Error('TRANSACTION_CLIENT_REQUIRED');
    await verify(tx);
    await assertAdminUsersSchemaReady(tx);
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK})`);
    const user = await findTarget(tx, email);
    const before = await others(tx, user.id);

    // Better Auth's own scrypt hasher; random secret (hashing does not depend on it, no cookie leaves this process).
    const auth = createAuth(tx, { secret: randomBytes(48).toString('base64url'), baseURL: 'https://provisioning.invalid', secureCookies: true });
    const hash = await (await auth.$context).password.hash(password);
    if (typeof hash !== 'string' || !hash || hash === password) throw new Error('PASSWORD_HASH_FAILED');
    await tx.account.update({ where: { id: user.credentialId }, data: { password: hash } });
    await tx.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    await tx.session.deleteMany({ where: { userId: user.id } });

    // End-to-end proof through the real login path, then remove the proof session as well.
    const signIn = await auth.api.signInEmail({ body: { email: user.email, password } });
    if (signIn?.user?.id !== user.id) throw new Error('SIGN_IN_CHECK_FAILED');
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.adminAuditEvent.create({ data: { action: 'OPERATOR_PASSWORD_RESET', actorId: null, targetUserId: user.id } });

    if (await tx.session.count({ where: { userId: user.id } }) !== 0) throw new Error('SESSION_CLEANUP_FAILED');
    if (await others(tx, user.id) !== before) throw new Error('OTHER_ACCOUNTS_CHANGED');
    return { id: user.id };
  }, { maxWait: 10000, timeout: 30000 });
}

async function connect({ local, prompt, log, PrismaClient }) {
  const Client = PrismaClient || require('@prisma/client').PrismaClient;
  if (local) {
    const url = loadTarget(root);
    return { db: new Client({ datasources: { db: { url } }, log: [] }), verify: tx => verifyServer(tx), label: 'banco local de teste' };
  }
  const target = parseRemoteTarget(await prompt('Conexao PostgreSQL DIRETA (entrada oculta): '));
  await confirmTarget(target, prompt, log);
  return { db: new Client({ datasources: { db: { url: target.url } }, log: [] }), verify: tx => verifyDatabase(tx, target), label: target.database };
}

async function main({
  argv = process.argv, prompt = hiddenPrompt, log = console.log, PrismaClient, createAuth,
  interactive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
} = {}) {
  const [mode, flag, ...rest] = argv.slice(2);
  if (!MODES.includes(mode) || rest.length || (flag !== undefined && flag !== '--local')) throw new Error('USE_DESIGNATE_OR_RECOVER_PASSWORD');
  if (!interactive()) throw new Error('INTERACTIVE_TERMINAL_REQUIRED');
  const { db, verify, label } = await connect({ local: flag === '--local', prompt, log, PrismaClient });
  let password = '';
  let confirmation = '';
  try {
    // Read-only checks before asking for anything else.
    await db.$transaction(async tx => { await verify(tx); await assertAdminUsersSchemaReady(tx); });
    if (mode === 'designate') {
      const principals = await db.user.count({ where: { isPrincipalAdmin: true } });
      log(`Administradores principais existentes neste banco: ${principals} (limite ${PRINCIPAL_LIMIT})`);
      if (principals >= PRINCIPAL_LIMIT) throw new Error('PRINCIPAL_ADMIN_LIMIT_REACHED');
      const expectedPrincipals = Number((await prompt('Digite a quantidade atual de principais para confirmar: ')).trim());
      if (expectedPrincipals !== principals) throw new Error('PRINCIPAL_COUNT_NOT_CONFIRMED');
      const email = normalizeEmail(await prompt('E-mail do ADMIN a designar como principal (entrada oculta): '));
      if ((await prompt(`Digite DESIGNAR para marcar 1 administrador principal em ${label}: `)).trim() !== 'DESIGNAR') throw new Error('CANCELLED');
      const result = await designatePrincipal(db, { email, expectedPrincipals, verify });
      log(`Administrador principal designado: ${result.id} (${result.principals}/${PRINCIPAL_LIMIT})`);
      return result;
    }
    const email = normalizeEmail(await prompt('E-mail do ADMIN a recuperar (entrada oculta): '));
    password = await prompt(`Senha temporaria (${PASSWORD_MIN}-${PASSWORD_MAX} caracteres, entrada oculta): `);
    confirmation = await prompt('Confirme a senha temporaria (entrada oculta): ');
    if (password !== confirmation) throw new Error('PASSWORD_CONFIRMATION_MISMATCH');
    confirmation = '';
    if ((await prompt(`Digite RECUPERAR para redefinir a senha e encerrar as sessoes desta conta em ${label}: `)).trim() !== 'RECUPERAR') throw new Error('CANCELLED');
    const result = await recoverAdminPassword(db, createAuth || await loadAuthFactory(), { email, password, verify });
    log(`Acesso recuperado: ${result.id}. Troca de senha obrigatoria no proximo login; sessoes anteriores encerradas.`);
    return result;
  } finally {
    password = confirmation = '';
    await db.$disconnect();
  }
}

module.exports = { designatePrincipal, recoverAdminPassword, assertAdminUsersSchemaReady, main, PRINCIPAL_LIMIT, LOCK, OTHERS_SQL };
if (require.main === module) main().catch(error => {
  // Only fixed error codes; never driver messages (may contain connection details or personal data).
  console.error(/^[A-Z_]+$/.test(error.message || '') ? error.message : 'OPERATOR_PROCEDURE_FAILED');
  process.exitCode = 1;
});
