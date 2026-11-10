// Stage generation outside the project (.env is never loaded), then copy changed files.
// An identical loaded Windows engine is retained, avoiding interruption of local servers.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { loadTarget } = require('./auth-test-safety.cjs');
const { isolatedEnvironment } = require('./local-auth-admin.cjs');
const root = path.resolve(__dirname, '..');
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
try {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clube-material-client-'));
  const output = path.join(directory, 'client');
  const target = path.dirname(require.resolve('.prisma/client/package.json', { paths: [path.dirname(require.resolve('@prisma/client'))] }));
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8').replace('provider = "prisma-client-js"',
    `provider = ${JSON.stringify('node ' + require.resolve('@prisma/client/generator-build/index.js').replaceAll('\\', '/'))}\n  output = ${JSON.stringify(output.replaceAll('\\', '/'))}`);
  const file = path.join(directory, 'schema.prisma');
  fs.writeFileSync(file, schema);
  const env = isolatedEnvironment(loadTarget(root));
  const generated = spawnSync(process.execPath, [require.resolve('prisma'), 'generate', '--schema', file], {
    cwd: directory, env, encoding: 'utf8', windowsHide: true,
  });
  if (generated.status !== 0) throw new Error('STAGED_GENERATION_FAILED');
  const backup = path.join(directory, 'previous-client');
  fs.cpSync(target, backup, { recursive: true });
  const hashes = {};
  for (const name of fs.readdirSync(target)) {
    if (!fs.statSync(path.join(target, name)).isFile()) continue;
    hashes[name] = digest(path.join(target, name));
    if (digest(path.join(backup, name)) !== hashes[name]) throw new Error('CLIENT_BACKUP_FAILED');
  }
  fs.writeFileSync(path.join(directory, 'previous-client-sha256.json'), JSON.stringify(hashes, null, 2));
  for (const name of fs.readdirSync(output)) {
    const source = path.join(output, name), dest = path.join(target, name);
    if (fs.existsSync(dest) && digest(dest) === digest(source)) continue;
    fs.copyFileSync(source, dest);
    if (digest(dest) !== digest(source)) throw new Error('CLIENT_COPY_FAILED');
  }
  console.log('PASS isolated Prisma generation and verified client copy; backup: ' + backup);
} catch (error) {
  console.error(/^[A-Z_]+$/.test(error.message || '') ? error.message : 'LOCAL_CLIENT_GENERATION_FAILED');
  console.error(JSON.stringify({ code: error.code, file: error.path ? path.basename(error.path) : undefined }));
  process.exitCode = 1;
}
