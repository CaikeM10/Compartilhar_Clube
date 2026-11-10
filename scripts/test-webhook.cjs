const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

// Compile only the dependency-injected module; never import Prisma or load .env.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'compartilhar-webhook-'));
try {
  const source = path.join(__dirname, '../lib/payments/mercado-pago-webhook.ts');
  const output = path.join(directory, 'webhook.cjs');
  const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: source,
  });
  fs.writeFileSync(output, compiled.outputText);
  const result = spawnSync(process.execPath, ['--test', path.join(__dirname, '../tests/webhook.test.cjs')], {
    stdio: 'inherit', env: { ...process.env, WEBHOOK_TEST_MODULE: output },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  // Explicitly named files in our unique temporary directory; no recursive removal.
  const output = path.join(directory, 'webhook.cjs');
  if (fs.existsSync(output)) fs.unlinkSync(output);
  fs.rmdirSync(directory);
}
