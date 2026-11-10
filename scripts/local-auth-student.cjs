// Manual local fixture only. No .env loading, payments, migrations or role changes.
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { loadTarget, verifyServer } = require('./auth-test-safety.cjs');
const { loadAuthFactory, hiddenPrompt } = require('./local-auth-admin.cjs');
const root = path.resolve(__dirname, '..');

async function createStudent(db, createAuth, email, password) {
  return db.$transaction(async tx => {
    await verifyServer(tx);
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(61420317)');
    if (await tx.user.findUnique({ where: { email } })) throw new Error('EXISTING_ACCOUNT_REFUSED');
    if (await tx.payment.count({ where: { email: { equals: email, mode: 'insensitive' } } })) {
      throw new Error('EXISTING_FINANCIAL_RECORD_REFUSED');
    }
    const auth = createAuth(tx, { secret: randomBytes(48).toString('base64url'),
      baseURL: 'http://127.0.0.1:3000', secureCookies: false });
    const result = await auth.api.signUpEmail({ body: { name: 'Aluno local de testes', email, password } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: result.user.id } });
    const account = await tx.account.findFirst({ where: { userId: user.id, providerId: 'credential' } });
    if (user.role !== 'STUDENT' || user.emailVerified || user.disabledAt !== null ||
        !account?.password || account.password === password) throw new Error('STUDENT_SIGNUP_INVARIANT_FAILED');
    // Dedicated zero-price test plan; never upsert a commercial plan or subscription.
    const plan = await tx.plan.create({ data: { name: `LOCAL_STUDENT_TEST_30D_${randomUUID()}`, price: 0, duration: 30 } });
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const subscription = await tx.subscription.create({ data: {
      userId: user.id, planId: plan.id, status: 'active', startDate, endDate,
    } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    return { userId: user.id, planId: plan.id, subscriptionId: subscription.id, endDate };
  }, { timeout: 30000 });
}

async function main() {
  const mode = process.argv[2];
  if (!['create', 'check'].includes(mode) || process.argv.length !== 3) throw new Error('USE_CREATE_OR_CHECK');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('INTERACTIVE_TERMINAL_REQUIRED');
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: loadTarget(root) } }, log: [] });
  try {
    await verifyServer(db);
    console.log('Destino confirmado: 127.0.0.1:5432 / compartilhar_auth_test / compartilhar_auth_test_user');
    const email = (await hiddenPrompt('E-mail do aluno (entrada oculta): ')).trim().toLowerCase();
    if (mode === 'check') {
      const user = await db.user.findUnique({ where: { email }, select: {
        role: true, disabledAt: true, accounts: { where: { providerId: 'credential' }, select: { password: true } },
        subscriptions: { where: { status: 'active', startDate: { lte: new Date() }, endDate: { gt: new Date() },
          plan: { name: { startsWith: 'LOCAL_STUDENT_TEST_30D_' }, price: 0, duration: 30 } }, select: { endDate: true } },
      } });
      if (!user || user.role !== 'STUDENT' || user.disabledAt !== null || !user.accounts.some(a => !!a.password) ||
          !user.subscriptions.length) throw new Error('LOCAL_STUDENT_NOT_READY');
      console.log('STUDENT confirmado; credencial presente; assinatura sintetica ativa.');
      console.log('Validade: ' + user.subscriptions[0].endDate.toISOString());
      return;
    }
    let password = await hiddenPrompt('Senha (entrada oculta, 8 a 128 caracteres): ');
    let confirmation = await hiddenPrompt('Repita a senha (entrada oculta): ');
    if (password !== confirmation || password.length < 8 || password.length > 128) {
      throw new Error('PASSWORD_CONFIRMATION_OR_LENGTH_INVALID');
    }
    let result;
    try { result = await createStudent(db, await loadAuthFactory(), email, password); }
    finally { password = confirmation = ''; }
    console.log('Aluno STUDENT criado. Assinatura sintetica ativa por 30 dias, sem pagamento.');
    console.log('Validade: ' + result.endDate.toISOString());
    console.log('Conta preservada para testes manuais. A conta ADMIN permanece intacta.');
    console.log('Entre em http://127.0.0.1:3000/login em uma janela anonima; destino: /aluno/dashboard');
  } finally { await db.$disconnect(); }
}

module.exports = { createStudent };
if (require.main === module) main().catch(error => {
  console.error(/^[A-Z_]+$/.test(error.message || '') ? error.message : 'LOCAL_STUDENT_OPERATION_FAILED');
  process.exitCode = 1;
});
