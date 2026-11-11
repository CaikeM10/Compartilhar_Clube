// Read-only audit. Never loads .env, signs in, seeds data or runs migrations.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const { loadTarget, verifyServer } = require('./auth-test-safety.cjs');
const root = path.resolve(__dirname, '..');
function load(file) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8').replace('import "server-only";', ''),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const m = { exports: {} }; new Function('require', 'module', 'exports', code)(require, m, m.exports); return m.exports;
}
async function main() {
  const db = new PrismaClient({ datasources: { db: { url: loadTarget(root) } }, log: [] });
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await verifyServer(tx);
      const { createAdminDashboardReader } = load('lib/admin/dashboard-core.ts');
      const { createAuthorization } = load('lib/auth/authorization-core.ts');
      const at = new Date();
      const admin = await tx.user.findFirst({ where: { role: 'ADMIN', disabledAt: null }, select: { id: true } });
      const student = await tx.user.findFirst({ where: { role: 'STUDENT', disabledAt: null }, select: { id: true } });
      assert.ok(admin && student, 'Existing enabled local ADMIN and STUDENT required');
      // Inject only session identity; actual role lookup/authorization uses existing local rows.
      // No Better Auth login: login/session refresh could write session records.
      const guards = id => createAuthorization({ api: { getSession: async () => ({ user: { id }, session: { id: '', expiresAt: new Date(at.getTime() + 60000) } }) } }, tx, async () => new Headers(), () => at);
      const adapter = { user: tx.user, subscription: tx.subscription, lesson: tx.lesson, $transaction: operations => Promise.all(operations) };
      await assert.rejects(createAdminDashboardReader(adapter, guards(student.id).requireAdmin, () => at)(), e => e.code === 'FORBIDDEN');
      const result = await createAdminDashboardReader(adapter, guards(admin.id).requireAdmin, () => at)();
      assert.equal(result.kind, 'ready');
      const until = new Date(at.getTime() + 7 * 86400000);
      const [expected] = await tx.$queryRaw`SELECT
        (SELECT count(*)::int FROM users WHERE role = 'STUDENT') AS students,
        (SELECT count(*)::int FROM subscriptions WHERE status = 'active' AND "startDate" <= ${at} AND "endDate" > ${at}) AS active,
        (SELECT count(*)::int FROM subscriptions WHERE status = 'active' AND "startDate" <= ${at} AND "endDate" > ${at} AND "endDate" <= ${until}) AS expiring,
        (SELECT count(*)::int FROM lessons) AS lessons,
        (SELECT count(*)::int FROM lessons WHERE status = 'PUBLISHED') AS published`;
      assert.deepEqual([result.students, result.activeSubscriptions, result.expiringSubscriptions, result.lessons, result.publishedLessons],
        [expected.students, expected.active, expected.expiring, expected.lessons, expected.published]);
      console.log(JSON.stringify({ result, readOnly: true, independentSqlMatches: true, studentDenied: true }));
    }, { isolationLevel: 'RepeatableRead', timeout: 15000 });
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('LOCAL_ADMIN_DASHBOARD_CHECK_FAILED_REDACTED'); process.exitCode = 1; });
