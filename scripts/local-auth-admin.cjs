// Local-only operational tool. Never load the application's .env files.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { loadTarget, verifyServer, validateTarget } = require('./auth-test-safety.cjs');
const root = path.resolve(__dirname, '..');
const receipt = path.join(root, '.local-auth-admin.json');

function isolatedEnvironment(url) {
  validateTarget(url);
  const env = { DATABASE_URL: url, TEST_DATABASE_URL: url, NODE_ENV: 'development',
    BETTER_AUTH_URL: 'http://127.0.0.1:3000', BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
    NEXT_TELEMETRY_DISABLED: '1',
    // Material persistence is opt-in; only this validated local environment enables it.
    MATERIALS_PERSISTENCE: 'enabled' };
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

// No readline echo, command arguments, environment variables or files for credentials.
function hiddenPrompt(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('INTERACTIVE_TERMINAL_REQUIRED');
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdout.write(label);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const done = (error) => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
      value = '';
    };
    const onData = chunk => {
      for (const char of chunk) {
        if (char === '\u0003') return done(new Error('CANCELLED'));
        if (char === '\r' || char === '\n') return done();
        if (char === '\u007f' || char === '\b') value = Array.from(value).slice(0, -1).join('');
        else if (char >= ' ' && char !== '\u001b') value += char;
      }
    };
    process.stdin.on('data', onData);
  });
}

async function loadAuthConfiguration() {
  const ts = require('typescript');
  const directory = fs.mkdtempSync(path.join(root, 'node_modules/.cache/local-admin-'));
  const file = path.join(directory, 'config.mjs');
  const source = fs.readFileSync(path.join(root, 'lib/auth/config.ts'), 'utf8');
  if (!source.startsWith('import "server-only";')) throw new Error('SERVER_CONFIG_REQUIRED');
  fs.writeFileSync(file, ts.transpileModule(source.replace('import "server-only";', ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText);
  try { return await import(pathToFileURL(file).href); }
  finally { fs.unlinkSync(file); fs.rmdirSync(directory); }
}

async function loadAuthFactory() {
  return (await loadAuthConfiguration()).createServerAuth;
}

async function prepareLocalRuntime(url) {
  const env = isolatedEnvironment(url);
  const { readAuthEnvironment } = await loadAuthConfiguration();
  readAuthEnvironment(env);
  console.log('DATABASE_URL: presente e local; BETTER_AUTH_SECRET: valido; BETTER_AUTH_URL: valido');
  return { directory: prepareApplicationSnapshot(), env };
}

async function createAdmin(db, createAuth, email, password, additional = false) {
  // One transaction: failed signup/promotion rolls back all authentication writes.
  return db.$transaction(async tx => {
    await verifyServer(tx);
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(61420317)');
    if (!additional && await tx.user.count({ where: { role: 'ADMIN' } })) throw new Error('LOCAL_ADMIN_ALREADY_EXISTS');
    if (await tx.user.findUnique({ where: { email } })) throw new Error('EXISTING_ACCOUNT_REFUSED');
    const auth = createAuth(tx, { secret: randomBytes(48).toString('base64url'),
      baseURL: 'http://127.0.0.1:3000', secureCookies: false });
    const result = await auth.api.signUpEmail({ body: { name: 'Administrador local de testes', email, password } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: result.user.id } });
    const account = await tx.account.findFirst({ where: { userId: user.id, providerId: 'credential' } });
    if (user.role !== 'STUDENT' || user.emailVerified || !account?.password || account.password === password) {
      throw new Error('SIGNUP_INVARIANT_FAILED');
    }
    // Explicit server-side promotion; never send role to the public signup API.
    await tx.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    return { id: user.id, email: user.email };
  }, { timeout: 30000 });
}

async function removeAdmin(db, record) {
  return db.$transaction(async tx => {
    await verifyServer(tx);
    const user = await tx.user.findUnique({ where: { id: record.id } });
    if (!user || user.email !== record.email || user.role !== 'ADMIN') throw new Error('RECEIPT_MISMATCH');
    if (await tx.subscription.count({ where: { userId: user.id } }) ||
        await tx.payment.count({ where: { email: { equals: user.email, mode: 'insensitive' } } })) {
      throw new Error('FINANCIAL_LINKS_REFUSE_DELETE');
    }
    // Respect Restrict: delete only this account's dependents before the user.
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.account.deleteMany({ where: { userId: user.id } });
    await tx.user.delete({ where: { id: user.id } });
  });
}

function prepareApplicationSnapshot() {
  // A .env-free working copy prevents Next from loading production secrets.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'compartilhar-browser-'));
  for (const name of ['app', 'components', 'contexts', 'hooks', 'lib', 'public', 'services', 'styles',
    'package.json', 'tsconfig.json', 'next-env.d.ts', 'next.config.js', 'postcss.config.mjs']) {
    const source = path.join(root, name);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(directory, name), { recursive: true,
      filter: file => !path.basename(file).startsWith('.env') });
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'junction');
  return directory;
}

async function main() {
  const mode = process.argv[2];
  if (!['create', 'create-additional', 'remove', 'dev', 'check'].includes(mode) || process.argv.length !== 3) throw new Error('USE_CREATE_REMOVE_DEV_OR_CHECK');
  const url = loadTarget(root);
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  try {
    await verifyServer(db);
    console.log('Destino confirmado: 127.0.0.1:5432 / compartilhar_auth_test / compartilhar_auth_test_user');
    if (mode === 'check') return;
    if (mode === 'dev') {
      await db.$disconnect();
      const { directory, env } = await prepareLocalRuntime(url);
      console.log('Login: http://127.0.0.1:3000/login (Ctrl+C para encerrar)');
      console.log('Copia temporaria isolada; reinicie este comando apos editar o projeto.');
      const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', directory,
        '--webpack', '--hostname', '127.0.0.1', '--port', '3000'], {
        cwd: directory, env, stdio: 'inherit',
      });
      await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', code => { process.exitCode = code || 0; resolve(); });
      });
      return;
    }
    if (mode === 'remove') {
      const saved = JSON.parse(fs.readFileSync(receipt, 'utf8'));
      const records = Array.isArray(saved) ? saved : [saved];
      const email = (await hiddenPrompt('Confirme o e-mail da conta a remover (entrada oculta): ')).trim().toLowerCase();
      const record = records.find(item => item.email === email);
      if (!record) throw new Error('EMAIL_MISMATCH');
      await removeAdmin(db, record);
      const remaining = records.filter(item => item.id !== record.id);
      if (remaining.length) fs.writeFileSync(receipt, JSON.stringify(remaining) + '\n', { mode: 0o600 });
      else fs.unlinkSync(receipt);
      console.log('Conta local removida.');
      return;
    }
    const additional = mode === 'create-additional';
    if (!additional && fs.existsSync(receipt)) throw new Error('LOCAL_RECEIPT_ALREADY_EXISTS');
    if (!additional && await db.user.count({ where: { role: 'ADMIN' } })) throw new Error('LOCAL_ADMIN_ALREADY_EXISTS');
    const saved = fs.existsSync(receipt) ? JSON.parse(fs.readFileSync(receipt, 'utf8')) : [];
    const records = Array.isArray(saved) ? saved : [saved];
    const email = (await hiddenPrompt('E-mail (entrada oculta): ')).trim().toLowerCase();
    let password = await hiddenPrompt('Senha (entrada oculta): ');
    let confirmation = await hiddenPrompt('Repita a senha (entrada oculta): ');
    if (password !== confirmation || password.length < 8 || password.length > 128) throw new Error('PASSWORD_CONFIRMATION_OR_LENGTH_INVALID');
    const createAuth = await loadAuthFactory();
    const record = await createAdmin(db, createAuth, email, password, additional);
    password = confirmation = '';
    fs.writeFileSync(receipt, JSON.stringify([...records, record]) + '\n', { flag: additional ? 'w' : 'wx', mode: 0o600 });
    console.log(record.email);
  } finally { await db.$disconnect(); }
}

module.exports = { createAdmin, removeAdmin, isolatedEnvironment, loadAuthFactory, loadAuthConfiguration, prepareApplicationSnapshot, prepareLocalRuntime, hiddenPrompt };
if (require.main === module) main().catch(error => {
  console.error(/^[A-Z_]+$/.test(error.message || '') ? error.message : 'LOCAL_AUTH_OPERATION_FAILED');
  process.exitCode = 1;
});
