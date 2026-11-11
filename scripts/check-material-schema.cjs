// Offline schema validation. Run Prisma outside the project so .env is not read.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clube-material-schema-'));
try {
  const effective = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const marker = '\n// Catalog models: applied only to the explicitly authorized local test database.';
  const current = effective.includes(marker) ? effective.slice(0, effective.indexOf(marker)) : effective;
  const proposal = fs.readFileSync(path.join(root, 'prisma/proposals/materials.prisma'), 'utf8');
  fs.writeFileSync(path.join(directory, 'current.prisma'), current);
  fs.writeFileSync(path.join(directory, 'proposed.prisma'), current + '\n' + proposal);
  const env = { DATABASE_URL: 'postgresql://offline:offline@127.0.0.1:5432/offline_validation', CHECKPOINT_DISABLE: '1' };
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA']) if (process.env[key]) env[key] = process.env[key];
  const run = args => execFileSync(process.execPath, [require.resolve('prisma'), ...args], { cwd: directory, env, encoding: 'utf8' });
  console.log(run(['validate', '--schema', 'current.prisma']));
  console.log(run(['validate', '--schema', 'proposed.prisma']));
  const sql = run(['migrate', 'diff', '--from-schema-datamodel', 'current.prisma', '--to-schema-datamodel', 'proposed.prisma', '--script']);
  // Diff uses datamodels only; it neither connects to PostgreSQL nor applies SQL.
  const proposedSQL = fs.readFileSync(path.join(root, 'prisma/proposals/materials.sql'), 'utf8');
  if (!proposedSQL.includes(sql.trim())) throw new Error('SQL_PROPOSAL_OUT_OF_SYNC');
  console.log('PASS additive SQL matches offline schema diff');
} finally {
  for (const file of ['current.prisma', 'proposed.prisma']) {
    const target = path.join(directory, file); if (fs.existsSync(target)) fs.unlinkSync(target);
  }
  fs.rmdirSync(directory);
}
