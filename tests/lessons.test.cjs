const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, overrides = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8').replace('import "server-only";', ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(overrides, name) ? overrides[name] : require(name), module, module.exports);
  return module.exports;
}
const validation = load('lib/lessons/validation.ts');
const core = load('lib/lessons/service-core.ts', { './validation': validation });
const authorization = load('lib/auth/authorization-core.ts');
const http = load('lib/lessons/http.ts', { './service-core': core, '@/lib/auth/authorization-core': authorization });
const input = { title: 'Transient test', description: 'Transaction rollback fixture, never published permanently',
  videoUrl: 'https://youtu.be/AAAAAAAAAAA', durationMinutes: 20 };

test('video input normalizes approved providers and rejects arbitrary/embed HTML URLs', () => {
  assert.equal(validation.normalizeVideoUrl(input.videoUrl), 'https://www.youtube-nocookie.com/embed/AAAAAAAAAAA');
  assert.equal(validation.normalizeVideoUrl('https://www.youtube.com/watch?v=AAAAAAAAAAA&list=ignored'), 'https://www.youtube-nocookie.com/embed/AAAAAAAAAAA');
  assert.equal(validation.normalizeVideoUrl('https://vimeo.com/123456789/abcdef1234'), 'https://player.vimeo.com/video/123456789?h=abcdef1234');
  assert.equal(validation.normalizeVideoUrl('https://player.vimeo.com/video/123456789?h=abcdef1234'), 'https://player.vimeo.com/video/123456789?h=abcdef1234');
  for (const value of ['javascript:alert(1)', 'http://youtube.com/watch?v=AAAAAAAAAAA', 'https://youtube.com.evil.invalid/watch?v=AAAAAAAAAAA',
    'https://user:secret@youtu.be/AAAAAAAAAAA', 'https://youtu.be:8443/AAAAAAAAAAA', 'https://127.0.0.1/video.mp4', '<iframe src="https://youtu.be/AAAAAAAAAAA">', 'https://vimeo.com/123456789?h=invalid!']) {
    assert.throws(() => validation.normalizeVideoUrl(value));
  }
  for (const data of [{ ...input, role: 'ADMIN' }, { ...input, status: 'PUBLISHED' }, { ...input, durationMinutes: 0 }, { ...input, durationMinutes: 1.5 }, { ...input, title: ' ' }]) {
    assert.equal(validation.lessonInput.safeParse(data).success, false);
  }
});

test('every read and mutation checks its server guard before touching persistence', async () => {
  const deny = async () => { throw new authorization.AuthorizationError(403, 'FORBIDDEN'); };
  const db = new Proxy({}, { get: () => assert.fail('unauthorized database access') });
  const service = core.createLessonService(db, { requireAdmin: deny, requireActiveSubscription: deny });
  for (const call of [() => service.listAdmin(), () => service.listPublished(), () => service.watch('private-id'), () => service.create(input),
    () => service.change('private-id', { action: 'status', status: 'PUBLISHED' }), () => service.change('private-id', { action: 'move', direction: 'up' })]) {
    await assert.rejects(call, error => error.status === 403);
  }
});

test('HTTP rejects foreign/missing Origin, malformed JSON and oversized payloads; sanitizes infrastructure errors', async () => {
  const base = 'http://127.0.0.1:3000';
  const request = (body, extra = {}) => new Request(base + '/api/admin/lessons', {
    method: 'POST', headers: { origin: base, 'content-type': 'application/json', ...extra }, body,
  });
  assert.deepEqual(await http.mutationBody(request(JSON.stringify(input)), base), input);
  for (const origin of ['', 'https://untrusted.invalid', 'http://localhost:3000']) {
    await assert.rejects(http.mutationBody(request('{}', { origin }), base), error => error.status === 403);
  }
  await assert.rejects(http.mutationBody(request('{'), base), error => error.status === 400);
  await assert.rejects(http.mutationBody(request('{}', { 'content-type': 'text/plain' }), base), error => error.status === 415);
  await assert.rejects(http.mutationBody(request('x'.repeat(65537)), base), error => error.status === 413);
  const response = await http.lessonResponse(async () => { throw new Error('private database details'); });
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'LESSONS_UNAVAILABLE' });
  assert.match(response.headers.get('cache-control'), /private, no-store/);
});

test('local PostgreSQL CRUD, publication, order and archive roll back without persisting any fixture', async () => {
  const { PrismaClient } = require('@prisma/client');
  const { loadTarget, verifyServer } = require('../scripts/auth-test-safety.cjs');
  const db = new PrismaClient({ datasources: { db: { url: loadTarget(root) } }, log: [] });
  const digest = async () => createHash('sha256').update(JSON.stringify(await Promise.all(
    ['user', 'account', 'session', 'plan', 'subscription', 'payment', 'verification', 'lesson'].map(model => db[model].findMany({ orderBy: { id: 'asc' } })),
  ))).digest('hex');
  const rollback = new Error('EXPECTED_ROLLBACK');
  let before;
  try {
    await verifyServer(db); before = await digest();
    await assert.rejects(db.$transaction(async tx => {
      await verifyServer(tx);
      // Run production service transactions inside this rollback-only test transaction.
      const scoped = new Proxy(tx, { get(target, key) { return key === '$transaction' ? fn => fn(tx) : target[key]; } });
      const allow = async () => ({});
      const service = core.createLessonService(scoped, { requireAdmin: allow, requireActiveSubscription: allow });
      const publishedBefore = await service.listPublished();
      const a = await service.create(input);
      const b = await service.create({ ...input, title: 'Second transient test' });
      assert.equal(a.status, 'DRAFT'); assert.ok(b.position > a.position);
      assert.deepEqual(await service.listPublished(), publishedBefore);
      await assert.rejects(service.watch(a.id), error => error.status === 404);
      await service.change(a.id, { action: 'edit', data: { ...input, title: 'Updated title', durationMinutes: 25 } });
      await service.change(a.id, { action: 'status', status: 'PUBLISHED' });
      await service.change(b.id, { action: 'status', status: 'PUBLISHED' });
      await service.change(b.id, { action: 'move', direction: 'up' });
      const published = (await service.listPublished()).filter(row => [a.id, b.id].includes(row.id));
      assert.deepEqual(published.map(row => row.id), [b.id, a.id]);
      assert.ok(published.every(row => !Object.hasOwn(row, 'videoUrl')));
      const watched = await service.watch(a.id);
      assert.equal(watched.title, 'Updated title'); assert.equal(watched.durationMinutes, 25);
      assert.equal(watched.videoUrl, validation.normalizeVideoUrl(input.videoUrl));
      await service.change(a.id, { action: 'status', status: 'DRAFT' });
      await assert.rejects(service.watch(a.id), error => error.status === 404);
      await service.change(b.id, { action: 'status', status: 'ARCHIVED' });
      await assert.rejects(service.watch(b.id), error => error.status === 404);
      assert.deepEqual(await service.listPublished(), publishedBefore);
      assert.equal((await service.listAdmin()).find(row => row.id === b.id).status, 'ARCHIVED');
      await service.change(b.id, { action: 'status', status: 'PUBLISHED' });
      assert.equal((await service.watch(b.id)).id, b.id);
      await assert.rejects(service.change('not-an-id', { action: 'status', status: 'DRAFT' }), error => error.status === 404);
      throw rollback;
    }, { timeout: 30000 }), error => error === rollback);
    assert.equal(await digest(), before, 'Existing database records must not change');
  } finally { await db.$disconnect(); }
});

test('persisted local roles and subscription rules are enforced with an injected session identity, without account changes', async () => {
  const { PrismaClient } = require('@prisma/client');
  const { loadTarget, verifyServer } = require('../scripts/auth-test-safety.cjs');
  const db = new PrismaClient({ datasources: { db: { url: loadTarget(root) } }, log: [] });
  try {
    await verifyServer(db);
    const student = await db.user.findFirst({ where: { role: 'STUDENT', disabledAt: null, subscriptions: { some: {
      status: 'active', startDate: { lte: new Date() }, endDate: { gt: new Date() },
    } } }, select: { id: true } });
    const admin = await db.user.findFirst({ where: { role: 'ADMIN', disabledAt: null }, select: { id: true } });
    assert.ok(student && admin, 'Requires existing authorized local test accounts');
    const access = (id, now) => authorization.createAuthorization({ api: { getSession: async () => id ? {
      user: { id }, session: { id: 'injected-test-session', expiresAt: new Date('2099-01-01') },
    } : null } }, db, async () => new Headers(), now);
    const service = core.createLessonService(db, access(student.id));
    await service.listPublished();
    await assert.rejects(service.listAdmin(), error => error.status === 403);
    await assert.rejects(service.create(input), error => error.status === 403);
    await core.createLessonService(db, access(admin.id)).listAdmin();
    await assert.rejects(core.createLessonService(db, access(null)).listPublished(), error => error.status === 401);
    await assert.rejects(core.createLessonService(db, access(student.id, () => new Date('2090-01-01'))).listPublished(), error => error.code === 'SUBSCRIPTION_REQUIRED');
  } finally { await db.$disconnect(); }
});

test('student list, watch page and admin API wrappers guard direct entry and avoid mock arrays', async () => {
  for (const file of ['app/aluno/aulas/page.tsx', 'app/aluno/aulas/[id]/page.tsx']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /await requirePageAccess\("subscriber"\)/);
    assert.doesNotMatch(source, /hasAccess|locked:|const aulas = \[/);
  }
  const source = fs.readFileSync(path.join(root, 'components/lessons/LessonManager.tsx'), 'utf8');
  assert.match(source, /Confirmar arquivamento/);
  assert.match(source, /Nenhuma aula cadastrada/);
  for (const file of ['app/api/admin/lessons/route.ts', 'app/api/admin/lessons/[id]/route.ts']) {
    assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /await requireAdmin\(\)/);
  }
});
