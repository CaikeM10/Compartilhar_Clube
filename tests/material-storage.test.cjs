// Etapa E: cover upload/serving and the Cloudflare R2 provider. No network, no database: the S3 client, the signer and
// the storage are in-memory doubles that exist only inside this test.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function load(file, overrides = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8').replace('import "server-only";', ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name.startsWith('@/') || name.startsWith('./')) throw new Error(`Unexpected import: ${name}`);
    return require(name);
  }, module, module.exports);
  return module.exports;
}

const cover = load('lib/materials/cover-image.ts');
const validation = load('lib/materials/validation.ts');
const storageModule = load('lib/storage/private-storage.ts');
const core = load('lib/materials/service-core.ts', { './validation': validation, '@/lib/storage/private-storage': storageModule, './cover-image': cover });
const authCore = load('lib/auth/authorization-core.ts');
const lessonCore = load('lib/lessons/service-core.ts', { './validation': load('lib/lessons/validation.ts') });
const lessonHttp = load('lib/lessons/http.ts', { './service-core': lessonCore, '@/lib/auth/authorization-core': authCore });
const http = load('lib/materials/http.ts', {
  '@/lib/auth/authorization-core': authCore, '@/lib/lessons/service-core': lessonCore, '@/lib/lessons/http': lessonHttp,
  '@/lib/storage/private-storage': storageModule, './service-core': core, './cover-image': cover,
});
const r2 = load('lib/storage/r2.ts', { './private-storage': storageModule });
const storageServer = load('lib/storage/server.ts', { './private-storage': storageModule, './r2': r2 });

const ORIGIN = 'http://127.0.0.1:3000';
const allow = { requireAdmin: async () => {}, requireActiveSubscription: async () => {} };
const deny = code => async () => { throw new authCore.AuthorizationError(code === 'UNAUTHENTICATED' ? 401 : 403, code); };
const noDb = () => new Proxy({}, { get(_, key) { assert.fail(`Database accessed: ${String(key)}`); } });

/** Minimal, structurally valid PNG (signature, IHDR, IEND). The validator reads headers only. */
function png(width, height) {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); ihdr.write('IHDR', 4); ihdr.writeUInt32BE(width, 8); ihdr.writeUInt32BE(height, 12); ihdr[16] = 8; ihdr[17] = 6;
  const idat = Buffer.concat([Buffer.from([0, 0, 0, 8]), Buffer.from('IDAT'), Buffer.alloc(8), Buffer.alloc(4)]);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, idat, Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])]));
}

function memoryStorage(objects = new Map()) {
  const calls = [];
  return {
    calls, objects, configured: true,
    async createUploadUrl(input) { calls.push(['upload', input]); return { url: 'https://storage.invalid/put', method: 'PUT', headers: {}, expiresAt: new Date(0) }; },
    async putObject(input) { calls.push(['put', input.key, input.contentType]); objects.set(input.key, { bytes: input.body, contentType: input.contentType }); },
    async headObject(key) { calls.push(['head', key]); const o = objects.get(key); return o ? { size: o.bytes.length, contentType: o.contentType } : null; },
    async readObject(key) { calls.push(['read', key]); const o = objects.get(key); return new Blob([o.bytes]).stream(); },
    async deleteObject(key) { calls.push(['delete', key]); objects.delete(key); },
    async createDownloadUrl(input) { calls.push(['download', input]); return 'https://storage.invalid/get'; },
  };
}

test('cover validator accepts every real catalog image and refuses other formats, truncation and bad dimensions', () => {
  const images = fs.readdirSync(path.join(root, 'public')).filter(name => /\.(png|jpe?g|webp)$/i.test(name));
  const covers = [...new Set(require('../lib/materials/catalog.json').map(item => item.image.slice(1)))];
  for (const name of covers) {
    assert.ok(images.includes(name), name);
    const bytes = new Uint8Array(fs.readFileSync(path.join(root, 'public', name)));
    if (bytes.length > cover.COVER_MAX_BYTES) continue; // the static catalog is served from public/, never re-uploaded
    assert.ok(cover.inspectCoverImage(bytes), `rejected real cover ${name}`);
  }
  assert.deepEqual(cover.inspectCoverImage(png(800, 1200)), { contentType: 'image/png', width: 800, height: 1200 });
  const refused = [
    png(100, 1200), png(800, 9000),
    png(800, 1200).subarray(0, 60), // truncated (no IEND)
    new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'),
    new TextEncoder().encode('<!doctype html><script>alert(1)</script>'),
    new TextEncoder().encode('GIF89a' + '\0'.repeat(200)),
    new TextEncoder().encode('%PDF-1.7\n' + 'x'.repeat(200)),
    new Uint8Array(0), new Uint8Array(cover.COVER_MAX_BYTES + 1),
  ];
  for (const bytes of refused) assert.equal(cover.inspectCoverImage(bytes), null);
});

test('only content-addressed cover names are servable; PDF keys and traversal never map to storage', () => {
  const name = `${'a'.repeat(64)}.webp`;
  assert.equal(cover.uploadedCoverFile(name), name);
  assert.equal(cover.uploadedCoverFile(`/api/materials/covers/${name}`), name);
  assert.equal(cover.coverStorageKey(name), `covers/${name}`);
  for (const bad of ['materials/m1/v1-x.pdf', `${'a'.repeat(64)}.pdf`, `../${name}`, `covers/${name}`, `${'A'.repeat(64)}.webp`,
    `${'a'.repeat(63)}.webp`, `${'a'.repeat(64)}.webp?x`, `${'a'.repeat(64)}.svg`, '/materials-covers/x.webp']) {
    assert.equal(cover.uploadedCoverFile(bad), null, bad);
  }
});

test('cover upload: admin first, storage required, bytes validated before any write, content-addressed and deduplicated', async () => {
  for (const code of ['UNAUTHENTICATED', 'FORBIDDEN']) {
    const storage = memoryStorage();
    const service = core.createMaterialService(noDb(), { ...allow, requireAdmin: deny(code) }, storage);
    await assert.rejects(service.uploadCover(png(800, 1200), 'image/png'), error => error.code === code);
    assert.equal(storage.calls.length, 0);
  }
  await assert.rejects(core.createMaterialService(noDb(), allow).uploadCover(png(800, 1200), 'image/png'), /STORAGE_NOT_CONFIGURED/);

  const storage = memoryStorage();
  const service = core.createMaterialService(noDb(), allow, storage);
  for (const [bytes, type] of [[png(800, 1200), 'image/jpeg'], [new TextEncoder().encode('<svg/>'), 'image/png'], [png(50, 50), 'image/png']]) {
    await assert.rejects(service.uploadCover(bytes, type), error => error.status === 422 && error.code === 'COVER_INVALID');
  }
  assert.equal(storage.calls.length, 0);

  const bytes = png(800, 1200);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const first = await service.uploadCover(bytes, 'image/png');
  assert.deepEqual(first, { coverImage: `/api/materials/covers/${sha}.png`, width: 800, height: 1200 });
  assert.deepEqual(storage.calls, [['head', `covers/${sha}.png`], ['put', `covers/${sha}.png`, 'image/png']]);
  storage.calls.length = 0;
  assert.deepEqual(await service.uploadCover(bytes, 'image/png'), first);
  assert.deepEqual(storage.calls, [['head', `covers/${sha}.png`]]); // same image: no second write
});

test('public cover read never touches the database and refuses PDFs, unknown names and mismatching objects', async () => {
  const name = `${'b'.repeat(64)}.png`;
  const storage = memoryStorage(new Map([
    [`covers/${name}`, { bytes: png(800, 1200), contentType: 'image/png' }],
    ['materials/m1/v1-secret.pdf', { bytes: new TextEncoder().encode('%PDF-1.7'), contentType: 'application/pdf' }],
    [`covers/${'c'.repeat(64)}.png`, { bytes: new TextEncoder().encode('%PDF-1.7'), contentType: 'application/pdf' }],
  ]));
  const service = core.createMaterialService(noDb(), { requireAdmin: deny('FORBIDDEN'), requireActiveSubscription: deny('UNAUTHENTICATED') }, storage);
  for (const bad of ['materials/m1/v1-secret.pdf', 'v1-secret.pdf', `../materials/${name}`, `${'d'.repeat(64)}.png`, `${'c'.repeat(64)}.png`]) {
    await assert.rejects(service.readCover(bad), error => error.status === 404 && error.code === 'COVER_NOT_FOUND', bad);
  }
  assert.ok(!storage.calls.some(([op, key]) => op === 'read' || String(key).startsWith('materials/')));
  const found = await service.readCover(name);
  assert.equal(found.contentType, 'image/png'); assert.equal(found.size, png(800, 1200).length);
});

test('materials accept an uploaded cover only if it exists in storage; arbitrary covers stay refused', async () => {
  const name = `${'e'.repeat(64)}.webp`;
  const storage = memoryStorage(new Map([[`covers/${name}`, { bytes: new Uint8Array(10), contentType: 'image/webp' }]]));
  const created = [];
  const db = { material: { findFirst: async () => null, create: async args => { created.push(args.data); return args.data; } } };
  const service = core.createMaterialService(db, allow, storage, { knownCovers: ['/known.webp'] });
  const input = cover => ({ title: 'Novo', description: null, priceCents: 490, currency: 'BRL', coverImage: cover, checkoutUrl: null, isPremium: false, displayOrder: 0 });
  await service.create(input(`/api/materials/covers/${name}`));
  assert.equal(created[0].coverImage, `/api/materials/covers/${name}`); assert.equal(created[0].status, 'DRAFT');
  for (const bad of [`/api/materials/covers/${'f'.repeat(64)}.webp`, '/api/materials/covers/x.webp', '/outra.webp']) {
    await assert.rejects(service.create(input(bad)), error => error.code === 'INVALID_COVER', bad);
  }
  const offline = core.createMaterialService(db, allow, undefined, { knownCovers: ['/known.webp'] });
  await assert.rejects(offline.create(input(`/api/materials/covers/${name}`)), error => error.code === 'INVALID_COVER');
});

test('cover upload body: same origin, image types only, hard size cap while streaming', async () => {
  const request = (headers, body = png(800, 1200)) => new Request(`${ORIGIN}/api/admin/materials/covers`, { method: 'POST', headers, body });
  await assert.rejects(http.coverUploadBody(request({ origin: 'https://evil.example', 'content-type': 'image/png' }), ORIGIN), e => e.code === 'INVALID_ORIGIN');
  await assert.rejects(http.coverUploadBody(request({ origin: ORIGIN, 'sec-fetch-site': 'cross-site', 'content-type': 'image/png' }), ORIGIN), e => e.code === 'INVALID_ORIGIN');
  for (const type of ['image/svg+xml', 'text/html', 'application/pdf', 'image/gif', '']) {
    await assert.rejects(http.coverUploadBody(request({ origin: ORIGIN, 'content-type': type }), ORIGIN), e => e.status === 415, type);
  }
  const big = new Uint8Array(cover.COVER_MAX_BYTES + 1);
  await assert.rejects(http.coverUploadBody(request({ origin: ORIGIN, 'content-type': 'image/png' }, big), ORIGIN), e => e.status === 413 && e.code === 'COVER_TOO_LARGE');
  const ok = await http.coverUploadBody(request({ origin: ORIGIN, 'content-type': 'image/png; charset=binary' }), ORIGIN);
  assert.equal(ok.contentType, 'image/png'); assert.deepEqual(ok.bytes, png(800, 1200));
});

test('cover responses are immutable and inert; errors are never cached', async () => {
  const ok = await http.coverResponse(async () => ({ body: new Blob([png(800, 1200)]).stream(), contentType: 'image/png', size: 10 }));
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('cache-control'), /public, max-age=31536000, s-maxage=31536000, immutable/);
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  assert.match(ok.headers.get('content-security-policy'), /default-src 'none'; sandbox/);
  const missing = await http.coverResponse(async () => { throw new core.MaterialError(404, 'COVER_NOT_FOUND'); });
  assert.equal(missing.status, 404); assert.equal(missing.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await missing.json(), { error: 'COVER_NOT_FOUND' });
  const broken = await http.coverResponse(async () => { throw new Error('bucket secret details'); });
  assert.equal(broken.status, 503); assert.deepEqual(await broken.json(), { error: 'COVER_UNAVAILABLE' });
});

test('admin cover route checks the ADMIN guard before reading the body; public route only reads covers', async () => {
  const log = [];
  const route = load('app/api/admin/materials/covers/route.ts', {
    '@/lib/materials/server': { getMaterials: () => ({ uploadCover: async () => { log.push('upload'); return { coverImage: '/api/materials/covers/x' }; } }) },
    '@/lib/materials/http': { ...http, coverUploadBody: async () => { log.push('body'); return { bytes: new Uint8Array(1), contentType: 'image/png' }; } },
    '@/lib/auth/config': { readAuthEnvironment: () => ({ baseURL: ORIGIN }) },
    '@/lib/auth/authorization': { requireAdmin: async () => { log.push('guard'); throw new authCore.AuthorizationError(403, 'FORBIDDEN'); } },
  });
  const denied = await route.POST(new Request(`${ORIGIN}/api/admin/materials/covers`, { method: 'POST' }));
  assert.equal(denied.status, 403); assert.deepEqual(log, ['guard']);

  const reads = [];
  const publicRoute = load('app/api/materials/covers/[file]/route.ts', {
    '@/lib/materials/server': { getMaterials: () => ({ readCover: async file => { reads.push(file); throw new core.MaterialError(404, 'COVER_NOT_FOUND'); } }) },
    '@/lib/materials/http': http,
  });
  const response = await publicRoute.GET(new Request(`${ORIGIN}/x`), { params: Promise.resolve({ file: 'materials-m1.pdf' }) });
  assert.equal(response.status, 404); assert.deepEqual(reads, ['materials-m1.pdf']);
});

test('R2 provider: signed PDF upload binds Content-Type, download is an attachment, errors never leak details', async () => {
  const sent = [];
  const signed = [];
  const client = { send: async command => {
    sent.push(command);
    if (command.constructor.name === 'HeadObjectCommand' && command.input.Key === 'missing') throw Object.assign(new Error('x'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
    if (command.constructor.name === 'HeadObjectCommand' && command.input.Key === 'broken') throw new Error('AccessDenied for bucket secret-bucket');
    if (command.constructor.name === 'HeadObjectCommand') return { ContentLength: 42, ContentType: 'application/pdf' };
    return {};
  } };
  const sign = async (_client, command, options) => { signed.push([command.constructor.name, command.input, options]); return 'https://signed.invalid/url'; };
  const storage = r2.createR2Storage({ accountId: 'a'.repeat(32), accessKeyId: 'k', secretAccessKey: 's', bucket: 'compartilhar-materiais-ensaio' }, client, sign);
  assert.equal(storage.configured, true);
  const upload = await storage.createUploadUrl({ key: 'materials/m1/v1.pdf', contentType: 'application/pdf', contentLength: 42, expiresInSeconds: 600 });
  assert.deepEqual(upload.headers, { 'Content-Type': 'application/pdf' }); assert.equal(upload.method, 'PUT');
  assert.equal(signed[0][0], 'PutObjectCommand'); assert.equal(signed[0][1].ContentType, 'application/pdf'); assert.equal(signed[0][1].ContentLength, 42);
  assert.deepEqual([...signed[0][2].signableHeaders], ['content-type']); assert.equal(signed[0][2].expiresIn, 600);
  await storage.createDownloadUrl({ key: 'materials/m1/v1.pdf', filename: 'Guia de Emoções.pdf', expiresInSeconds: 60 });
  assert.equal(signed[1][0], 'GetObjectCommand'); assert.equal(signed[1][2].expiresIn, 60);
  assert.equal(signed[1][1].ResponseContentDisposition, 'attachment; filename="Guia de Emocoes.pdf"; filename*=UTF-8\'\'Guia%20de%20Emo%C3%A7%C3%B5es.pdf');
  assert.deepEqual(await storage.headObject('ok'), { size: 42, contentType: 'application/pdf' });
  assert.equal(await storage.headObject('missing'), null);
  await assert.rejects(storage.headObject('broken'), error => error.code === 'STORAGE_UNAVAILABLE' && !/secret|bucket/i.test(error.message));
  await storage.putObject({ key: 'covers/x.png', body: new Uint8Array(3), contentType: 'image/png' });
  assert.equal(sent.at(-1).input.Bucket, 'compartilhar-materiais-ensaio'); assert.equal(sent.at(-1).input.ContentLength, 3);
});

test('R2 configuration: all four variables valid or the storage stays unconfigured (fail closed)', () => {
  const env = { R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'b'.repeat(32), R2_SECRET_ACCESS_KEY: 'c'.repeat(64), R2_BUCKET: 'compartilhar-materiais-ensaio' };
  assert.deepEqual(storageServer.readR2Config(env), { accountId: env.R2_ACCOUNT_ID, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, bucket: env.R2_BUCKET });
  assert.equal(storageServer.getPrivateStorage(env).configured, true);
  for (const [key, value] of [['R2_ACCOUNT_ID', ''], ['R2_ACCOUNT_ID', 'x'.repeat(32)], ['R2_BUCKET', 'Bucket_Invalido'], ['R2_ACCESS_KEY_ID', 'a b'], ['R2_SECRET_ACCESS_KEY', undefined]]) {
    const partial = { ...env, [key]: value };
    assert.equal(storageServer.readR2Config(partial), null, key);
    assert.equal(storageServer.getPrivateStorage(partial).configured, false, key);
  }
});
