const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadTarget, verifyServer } = require('./auth-test-safety.cjs');
  const root = path.resolve(__dirname, '..');

async function main() {
  const loginTests = process.argv.includes('--real-login');
  const privateTests = process.argv.includes('--private-access') || loginTests;
  const serverTests = process.argv.includes('--server-infrastructure') || privateTests;
  const moduleNames = ['config', 'authorization-core', 'http', ...(privateTests ? ['page-access-core'] : []), ...(loginTests ? ['account-http', 'client', 'session-store'] : [])];
  if (serverTests && !process.argv.includes('--verify-existing')) throw new Error('SERVER_TESTS_REQUIRE_EXISTING_SCHEMA');
  const url = loadTarget(root);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'compartilhar-auth-'));
  const clientPath = path.join(root, 'node_modules/.cache/compartilhar-auth-client');
  const schemaPath = path.join(directory, 'schema.prisma');
  let currentSchemaPath = schemaPath;
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8')
    .replace('env("DATABASE_URL")', 'env("TEST_DATABASE_URL")')
    .replace('provider = "prisma-client-js"', `provider = ${JSON.stringify('node ' + require.resolve('@prisma/client/generator-build/index.js').replaceAll('\\', '/'))}\n  output = ${JSON.stringify(clientPath.replaceAll('\\', '/'))}`);
  if (schema.includes('DATABASE_URL') && schema.includes('env("DATABASE_URL")')) throw new Error('ISOLATION_FAILED');
  fs.writeFileSync(schemaPath, schema);
  // Allowlist: no production URLs, Better Auth secrets, dotenv preload or NODE_OPTIONS.
  const env = { TEST_DATABASE_URL: url, NODE_ENV: 'test', PRISMA_HIDE_UPDATE_MESSAGE: '1', PRISMA_GENERATE_SKIP_AUTOINSTALL: '1' };
  const engines = path.dirname(require.resolve('@prisma/engines/package.json', { paths: [path.dirname(require.resolve('prisma/package.json'))] }));
  env.PRISMA_SCHEMA_ENGINE_BINARY = path.join(engines, 'schema-engine-windows.exe');
  env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(engines, 'query_engine-windows.dll.node');
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const audit = { target: { host: '127.0.0.1', port: 5432, database: 'compartilhar_auth_test', user: 'compartilhar_auth_test_user' }, commands: [], startedAt: new Date().toISOString() };
  const report = path.join(root, loginTests ? 'docs/real-login/run.json' : privateTests ? 'docs/private-access/run.json' : serverTests ? 'docs/auth-server/run.json' : 'docs/auth-homologation/run.json');
  fs.mkdirSync(path.dirname(report), { recursive: true });
  let db;
  const prisma = (...args) => {
    audit.commands.push(`prisma ${args.join(' ')} --schema <isolated-temp>/${path.basename(currentSchemaPath)}`);
    const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args, '--schema', currentSchemaPath], { cwd: directory, env, encoding: 'utf8', timeout: 60000 });
    // Never emit Prisma stdout/stderr: drivers may include connection credentials.
    if (result.status !== 0) throw new Error(`PRISMA_${args[0].toUpperCase()}_FAILED`);
    console.log(`PASS prisma ${args.join(' ')}`);
  };
  try {
    prisma('validate');
    prisma('generate');
    if (serverTests) {
      // Generate application types only; no database command uses this schema.
      const applicationClient = path.dirname(require.resolve('.prisma/client/default', { paths: [path.dirname(require.resolve('@prisma/client'))] }));
      const applicationSchema = schema.replace('env("TEST_DATABASE_URL")', 'env("DATABASE_URL")')
        .replace(JSON.stringify(clientPath.replaceAll('\\', '/')), JSON.stringify(applicationClient.replaceAll('\\', '/')));
      currentSchemaPath = path.join(directory, 'application.prisma');
      fs.writeFileSync(currentSchemaPath, applicationSchema);
      try { prisma('generate'); } finally { fs.unlinkSync(currentSchemaPath); currentSchemaPath = schemaPath; }
    }
    const { PrismaClient } = require(clientPath);
    db = new PrismaClient({ datasources: { db: { url } }, log: [] });
    audit.server = await verifyServer(db);
    const objects = await db.$queryRawUnsafe(`SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      AND c.relkind IN ('r','p','v','m','S','f')`);
    const types = await db.$queryRawUnsafe(`SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND t.typtype='e'`);
    audit.initialObjectCount = objects.length;
    audit.initialEnumCount = types.length;
    if (process.argv.includes('--verify-existing')) {
      const expected = ['auth_accounts', 'auth_sessions', 'auth_verifications', 'payments', 'plans', 'subscriptions', 'users'];
      if (objects.length !== expected.length || objects.some(o => o.nspname !== 'public' || !expected.includes(o.relname))) throw new Error('AUTH_TEST_UNEXPECTED_STRUCTURE');
      for (const table of expected) {
        const [row] = await db.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "public"."${table}"`);
        if (row.count !== 0) throw new Error('AUTH_TEST_DATABASE_NOT_EMPTY_REFUSING_WRITE');
      }
      audit.mode = 'verify-existing-empty-tables-no-ddl';
      console.log('PASS server identity and all seven existing tables empty; no DDL');
    } else {
      if (objects.length || types.length) throw new Error('AUTH_TEST_DATABASE_NOT_EMPTY_REFUSING_WRITE');
      console.log('PASS server identity and empty database (no user relations/enums)');
      prisma('db', 'push', '--skip-generate');
    }
    audit.tables = await db.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
    audit.foreignKeys = await db.$queryRawUnsafe(`SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' ORDER BY conname`);
    audit.indexes = await db.$queryRawUnsafe(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`);
    audit.columns = await db.$queryRawUnsafe(`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`);
    await db.$disconnect();
    db = undefined;
    const testFiles = ['tests/auth-integration.test.cjs'];
    let compiledPath;
    if (serverTests) {
      const ts = require('typescript');
      compiledPath = fs.mkdtempSync(path.join(root, 'node_modules/.cache/auth-server-tests-'));
      for (const name of moduleNames) {
        const source = fs.readFileSync(path.join(root, `lib/auth/${name}.ts`), 'utf8');
        // Only remove Next's build-time marker in the Node test harness. All
        // authentication/authorization code and Better Auth imports are real.
        if (!['client', 'session-store'].includes(name) && !source.startsWith('import "server-only";')) throw new Error('SERVER_ONLY_MARKER_MISSING');
        const compiled = ts.transpileModule(source.replace('import "server-only";', ''), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
        });
        fs.writeFileSync(path.join(compiledPath, `${name}.mjs`), compiled.outputText.replace('from "./authorization-core"', 'from "./authorization-core.mjs"'));
      }
      testFiles.push('tests/auth-server.test.cjs');
      if (privateTests) testFiles.push('tests/private-access.test.cjs');
      if (loginTests) testFiles.push('tests/real-login.test.cjs');
    }
    audit.commands.push(`node --test --test-concurrency=1 ${testFiles.join(' ')} (isolated environment)`);
    if (testFiles.some(name => !fs.existsSync(path.join(root, name)))) throw new Error('TEST_FILE_MISSING');
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...testFiles.map(name => path.join(root, name))], {
      cwd: directory, env: { ...env, AUTH_TEST_CLIENT: clientPath, ...(compiledPath ? { AUTH_SERVER_TEST_MODULES: compiledPath } : {}) }, encoding: 'utf8',
    });
    if (compiledPath) {
      for (const name of moduleNames) fs.unlinkSync(path.join(compiledPath, `${name}.mjs`));
      fs.rmdirSync(compiledPath);
    }
    // Tests emit only named outcomes and sanitized error codes.
    const output = ((result.stdout || '') + (result.stderr || '')).replaceAll(url, '[REDACTED]').replace(/postgres(?:ql)?:\/\/\S+/gi, '[REDACTED]');
    fs.writeFileSync(path.join(path.dirname(report), 'integration.tap'), output);
    console.log(output);
    audit.testExitCode = result.status;
    db = new PrismaClient({ datasources: { db: { url } }, log: [] });
    await verifyServer(db);
    audit.finalRowCounts = {};
    for (const table of audit.tables.map(t => t.tablename)) {
      if (!['users', 'auth_accounts', 'auth_sessions', 'auth_verifications', 'plans', 'subscriptions', 'payments'].includes(table)) throw new Error('UNEXPECTED_TABLE');
      const [row] = await db.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "public"."${table}"`);
      audit.finalRowCounts[table] = row.count;
    }
    if (Object.values(audit.finalRowCounts).some(n => n !== 0)) throw new Error('SYNTHETIC_CLEANUP_INCOMPLETE');
    if (result.status !== 0) throw new Error('AUTH_INTEGRATION_FAILED');
    audit.result = 'passed';
  } catch (error) {
    audit.result = 'failed';
    audit.error = /^([A-Z_]+)$/.test(error.message) ? error.message : 'SANITIZED_EXECUTION_FAILURE';
    console.error(audit.error);
    process.exitCode = 1;
  } finally {
    if (db) await db.$disconnect();
    audit.finishedAt = new Date().toISOString();
    fs.writeFileSync(report, JSON.stringify(audit, null, 2) + '\n');
    fs.writeFileSync(path.join(path.dirname(report), `run-${audit.startedAt.replaceAll(':', '-')}.json`), JSON.stringify(audit, null, 2) + '\n');
    fs.unlinkSync(schemaPath);
    // Prisma may leave auxiliary engine files; do not recursively remove them.
    if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
  }
}
main().catch(() => { console.error('AUTH_TEST_PRECHECK_FAILED'); process.exitCode = 1; });
