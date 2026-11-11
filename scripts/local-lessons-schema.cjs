// Explicit local-only additive schema application. No db push, reset or production env.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { loadTarget, verifyServer } = require('./auth-test-safety.cjs');
const { isolatedEnvironment } = require('./local-auth-admin.cjs');
const root = path.resolve(__dirname, '..');
async function applySchema(url) {
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  try {
    await verifyServer(db);
    await db.$transaction(async tx => {
      await verifyServer(tx);
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(61420319)');
      const [existing] = await tx.$queryRawUnsafe("SELECT to_regclass('public.lessons')::text AS relation");
      if (existing.relation) { console.log('Tabela lessons ja existe; nenhum DDL executado.'); return; }
      for (const statement of fs.readFileSync(path.join(root, 'prisma/local/lessons.sql'), 'utf8').split(';').map(s => s.trim()).filter(Boolean)) {
        await tx.$executeRawUnsafe(statement);
      }
      console.log('Tabela lessons criada exclusivamente no PostgreSQL local autorizado.');
    });
  } finally { await db.$disconnect(); }
}
async function main() {
  const url = loadTarget(root);
  if (process.argv[2] === '--apply') { await applySchema(url); return; }
  if (process.argv.length !== 2) throw new Error('UNEXPECTED_ARGUMENT');
  // The verifier itself loads the Windows DLL: exit that child before generation.
  const applied = spawnSync(process.execPath, [__filename, '--apply'], {
    cwd: root, env: isolatedEnvironment(url), stdio: 'inherit', windowsHide: true,
  });
  if (applied.status !== 0) throw new Error('LOCAL_SCHEMA_APPLICATION_FAILED');
  // Generate from an env-free schema directory; output only to this project's generated client.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'compartilhar-lessons-schema-'));
  const file = path.join(directory, 'schema.prisma');
  const clientDirectory = path.dirname(require.resolve('.prisma/client/package.json', { paths: [path.dirname(require.resolve('@prisma/client'))] }));
  fs.writeFileSync(file, fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8')
    .replace('provider = "prisma-client-js"', `provider = ${JSON.stringify('node ' + require.resolve('@prisma/client/generator-build/index.js').replaceAll('\\', '/'))}\n  output = ${JSON.stringify(clientDirectory.replaceAll('\\', '/'))}`));
  try {
    for (const action of ['validate', 'generate']) {
      const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), action, '--schema', file], {
        cwd: directory, env: isolatedEnvironment(url), encoding: 'utf8', windowsHide: true,
      });
      if (result.status !== 0) {
        if (/EPERM.*query_engine-windows/s.test((result.stdout || '') + (result.stderr || ''))) throw new Error('STOP_NEXT_BEFORE_PRISMA_GENERATE');
        throw new Error('LOCAL_PRISMA_' + action.toUpperCase() + '_FAILED');
      }
      console.log('PASS Prisma ' + action);
    }
  } finally { fs.unlinkSync(file); }
}
main().catch(error => {
  console.error(/^[A-Z_]+$/.test(error.message || '') ? error.message : 'LOCAL_LESSON_SCHEMA_FAILED');
  process.exitCode = 1;
});
