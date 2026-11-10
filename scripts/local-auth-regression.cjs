// Run auth regressions without the empty-database/migration runner.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const { loadTarget, verifyServer } = require('./auth-test-safety.cjs');
const { isolatedEnvironment } = require('./local-auth-admin.cjs');
const root = path.resolve(__dirname, '..');

async function main() {
  const url = loadTarget(root);
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  let directory, before;
  const names = ['config', 'authorization-core', 'page-access-core', 'http', 'account-http', 'client', 'session-store'];
  const snapshot = async () => {
    const records = await Promise.all(['user', 'account', 'session', 'plan', 'subscription', 'payment', 'verification', 'lesson']
      .map(model => db[model].findMany({ orderBy: { id: 'asc' } })));
    return { users: records[0].map(user => ({ id: user.id, email: user.email })),
      digest: createHash('sha256').update(JSON.stringify(records)).digest('hex') };
  };
  try {
    await verifyServer(db);
    before = await snapshot();
    // These suites use reserved synthetic identities. Refuse collisions before writing.
    const fixtureEmails = ['student-server@example.invalid', 'admin-fixture-server@example.invalid',
      'contains-admin-but-student@example.invalid', 'privileged-fixture@example.invalid', 'historical-login@example.invalid',
      'private-student@example.invalid', 'private-admin-fixture@example.invalid'];
    assert.ok(!before.users.some(user => fixtureEmails.includes(user.email) || user.id === 'historical-login-fixed-id'));
    directory = fs.mkdtempSync(path.join(root, 'node_modules/.cache/local-regression-'));
    for (const name of names) {
      const source = fs.readFileSync(path.join(root, 'lib/auth', `${name}.ts`), 'utf8');
      const output = ts.transpileModule(source.replace('import "server-only";', ''), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      }).outputText.replace('from "./authorization-core"', 'from "./authorization-core.mjs"');
      fs.writeFileSync(path.join(directory, `${name}.mjs`), output);
    }
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1',
      path.join(root, 'tests/auth-server.test.cjs'), path.join(root, 'tests/real-login.test.cjs'), path.join(root, 'tests/private-access.test.cjs')], {
      cwd: directory, env: { ...isolatedEnvironment(url), AUTH_TEST_CLIENT: require.resolve('@prisma/client'),
        AUTH_SERVER_TEST_MODULES: directory }, encoding: 'utf8', windowsHide: true,
    });
    const output = ((result.stdout || '') + (result.stderr || '')).replaceAll(url, '[REDACTED]')
      .replace(/postgres(?:ql)?:\/\/\S+/gi, '[REDACTED]');
    process.stdout.write(output);
    if (result.status !== 0) throw new Error('LOCAL_AUTH_REGRESSION_FAILED');
  } finally {
    try {
      if (before) {
        assert.deepEqual(await snapshot(), before);
        console.log('PASS all existing records unchanged, including plans, subscriptions, payments and lessons');
      }
    } finally {
      await db.$disconnect();
      if (directory) {
        for (const name of names) {
          const file = path.join(directory, `${name}.mjs`);
          if (fs.existsSync(file)) fs.unlinkSync(file);
        }
        fs.rmdirSync(directory);
      }
    }
  }
}
main().catch(error => {
  console.error(/^[A-Z][A-Z0-9_]+$/.test(error.message || '') ? error.message : 'LOCAL_AUTH_REGRESSION_FAILED_REDACTED');
  process.exitCode = 1;
});
