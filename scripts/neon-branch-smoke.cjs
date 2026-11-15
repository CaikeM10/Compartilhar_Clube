// Compatibility smoke test for a MIGRATED Neon REHEARSAL BRANCH (never the production branch).
//   node scripts/neon-branch-smoke.cjs
// Runs the application's Prisma Client and Better Auth configuration against the branch inside ONE
// transaction that always ends in ROLLBACK: nothing persists, even the synthetic account.
// Prints only booleans, counts and fixed codes — never e-mails, names, ids, hashes or tokens.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { hiddenPrompt, loadAuthFactory } = require('./local-auth-admin.cjs');
const { parseRemoteTarget, confirmTarget, verifyDatabase, assertAuthSchemaReady } = require('./neon-target.cjs');

const ROLLBACK = new Error('SMOKE_ROLLBACK');
const FORBIDDEN_BRANCHES = new Set(['production', 'main', 'prod', 'master']);

function assertRehearsalBranch(name) {
  const branch = String(name || '').trim().toLowerCase();
  if (!branch || FORBIDDEN_BRANCHES.has(branch)) throw new Error('REHEARSAL_BRANCH_REQUIRED');
  return branch;
}

const codeOf = error => error?.body?.code || (/^[A-Z_]+$/.test(error?.message || '') ? error.message : 'UNEXPECTED_ERROR');

async function smoke(db, createAuth, target) {
  const report = {};
  const synthetic = `smoke-${randomBytes(10).toString('hex')}@example.invalid`;
  const password = randomBytes(24).toString('base64url');
  try {
    await db.$transaction(async tx => {
      await verifyDatabase(tx, target);
      await assertAuthSchemaReady(tx);

      // 1. Every model the deployed code reads, with the generated client (all columns selected).
      const read = async (name, fn) => { try { await fn(); return true; } catch { return false; } };
      report.prismaModels = {
        user: await read('user', () => tx.user.findFirst()),
        plan: await read('plan', () => tx.plan.findFirst()),
        subscription: await read('subscription', () => tx.subscription.findFirst({ include: { user: true, plan: true } })),
        payment: await read('payment', () => tx.payment.findFirst()),
        account: await read('account', () => tx.account.count()),
        session: await read('session', () => tx.session.count()),
        verification: await read('verification', () => tx.verification.count()),
        lesson: await read('lesson', () => tx.lesson.count()),
      };

      // 2. Application configuration: public sign-up closed.
      const env = { secret: randomBytes(48).toString('base64url'), baseURL: 'https://smoke.invalid', secureCookies: true };
      const closed = createAuth(tx, env);
      try { await closed.api.signUpEmail({ body: { name: 'Smoke', email: synthetic, password } }); report.publicSignUp = 'OPEN'; }
      catch (error) { report.publicSignUp = codeOf(error); }

      // 3. Full credential cycle through Better Auth on the real schema (rolled back).
      const opened = createAuth(tx, { ...env, allowSignUp: true });
      const created = await opened.api.signUpEmail({ body: { name: 'Smoke', email: synthetic, password } });
      const account = await tx.account.findFirst({ where: { userId: created.user.id }, select: { providerId: true, accountId: true, password: true } });
      const stored = await tx.user.findUnique({ where: { id: created.user.id }, select: { role: true, emailVerified: true, disabledAt: true } });
      report.syntheticAccount = {
        role: stored.role, emailVerified: stored.emailVerified, disabled: stored.disabledAt !== null,
        credentialShape: account?.providerId === 'credential' && account.accountId === created.user.id && !!account.password && account.password !== password,
      };
      report.signInValid = (await opened.api.signInEmail({ body: { email: synthetic, password } }))?.user?.id === created.user.id;
      try { await closed.api.signInEmail({ body: { email: synthetic, password: `${password}x` } }); report.signInWrongPassword = 'ACCEPTED'; }
      catch (error) { report.signInWrongPassword = codeOf(error); }

      // 4. Existing (legacy) users: Better Auth must load them and answer 401-type errors, never a crash.
      const context = await closed.$context;
      const legacy = await tx.user.findMany({ where: { NOT: { id: created.user.id } }, select: { email: true, name: true }, take: 200, orderBy: { id: 'asc' } });
      let found = 0; let notFound = 0; let nullNameLoaded = 0; let errors = 0;
      for (const user of legacy) {
        try {
          const result = await context.internalAdapter.findUserByEmail(user.email);
          if (result) { found++; if (user.name === null) nullNameLoaded++; } else notFound++;
        } catch { errors++; }
      }
      report.legacyLookup = { sampled: legacy.length, found, notFoundByCase: notFound, nullNameLoaded, errors };
      if (legacy.length) {
        try { await closed.api.signInEmail({ body: { email: legacy[0].email.toLowerCase(), password: randomBytes(16).toString('hex') } }); report.legacySignIn = 'ACCEPTED'; }
        catch (error) { report.legacySignIn = codeOf(error); }
      }
      throw ROLLBACK;
    }, { maxWait: 10000, timeout: 60000 });
  } catch (error) { if (error !== ROLLBACK) throw error; }
  report.syntheticPersisted = (await db.user.count({ where: { email: synthetic } })) !== 0;
  report.pass = Object.values(report.prismaModels).every(Boolean) && report.publicSignUp === 'EMAIL_PASSWORD_SIGN_UP_DISABLED' &&
    report.syntheticAccount.role === 'STUDENT' && report.syntheticAccount.credentialShape && report.signInValid === true &&
    report.signInWrongPassword === 'INVALID_EMAIL_OR_PASSWORD' && report.legacyLookup.errors === 0 &&
    (report.legacySignIn === undefined || report.legacySignIn === 'INVALID_EMAIL_OR_PASSWORD') && !report.syntheticPersisted;
  return report;
}

async function main() {
  if (process.argv.length !== 2) throw new Error('NO_ARGUMENTS_ACCEPTED');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('INTERACTIVE_TERMINAL_REQUIRED');
  assertRehearsalBranch(await hiddenPrompt('Nome da branch de ENSAIO no Neon (nao production): '));
  const target = parseRemoteTarget(await hiddenPrompt('Conexao DIRETA da branch de ensaio (entrada oculta): '));
  await confirmTarget(target, hiddenPrompt);
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: target.url } }, log: [] });
  try {
    const report = await smoke(db, await loadAuthFactory(), target);
    const output = JSON.stringify(report, null, 2);
    // Report holds only booleans, counts and codes; safe to keep for review.
    const file = path.join(__dirname, '..', 'docs/producao-migracao/resultados/smoke-ensaio.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, output + '\n');
    console.log(output);
    console.log(`Resultado salvo em ${path.relative(process.cwd(), file)}`);
    if (!report.pass) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}

module.exports = { smoke, assertRehearsalBranch };
if (require.main === module) main().catch(error => {
  console.error(/^[A-Z_]+$/.test(error.message || '') ? error.message : 'SMOKE_FAILED');
  process.exitCode = 1;
});
