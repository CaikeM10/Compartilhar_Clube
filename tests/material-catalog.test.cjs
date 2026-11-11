const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const baseline = require('../docs/catalogo/baseline.json');
const materials = require('../lib/materials/catalog.json');
const { initialRecords, planImport } = require('../scripts/material-catalog-import-plan.cjs');
function loadSource(source, imports = require) {
  const code = ts.transpileModule(source.replace('import "server-only";', ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const m = { exports: {} }; new Function('require', 'module', 'exports', code)(imports, m, m.exports); return m.exports;
}
const load = (file, imports = require) => loadSource(fs.readFileSync(path.join(root, file), 'utf8'), imports);

test('all 15 commercial products retain exact values, optional properties, order and public markup', async () => {
  assert.equal(materials.length, 15);
  assert.equal(new Set(materials.map(x => x.id)).size, 15);
  assert.deepEqual(materials.map(({ id, ...data }) => data), baseline.products);
  assert.equal(materials[13].checkoutUrl, '');
  assert.equal(materials[4].checkoutUrl, materials[5].checkoutUrl);
  for (const material of materials) assert.ok(fs.existsSync(path.join(root, 'public', material.image)));

  // Etapa D: /materiais became a Server Component reading published materials (lib/materials/pages.ts).
  // The former byte-for-byte source comparison is replaced by rendering equivalence: the approved
  // baseline JSX is compiled and rendered with the same components, and the new page must produce the
  // exact same HTML both with persistence disabled and with the 15 seed rows coming from the database.
  const source = fs.readFileSync(path.join(root, 'app/materiais/page.tsx'), 'utf8');
  assert.doesNotMatch(source, /["']use client["']|requirePageAccess|@\/lib\/auth|const materials = \[/);
  assert.match(source, /await getPublicCatalog\(\)/);
  const legacy = loadSource(`import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { MaterialCard } from "@/components/materials/MaterialCard";
import { ArrowLeft } from "lucide-react";
import { materials } from "@/lib/materials/catalog";
${baseline.publicMarkup}`, publicImports(pagesWith(disabledMaterials))).default;
  const expected = renderToStaticMarkup(legacy());
  assert.equal((expected.match(/Comprar material/g) ?? []).length, 15);
  const seeded = { getMaterials: () => ({ listPublished: async () => initialRecords() }) };
  for (const server of [disabledMaterials, seeded]) {
    const Page = load('app/materiais/page.tsx', publicImports(pagesWith(server))).default;
    assert.equal(renderToStaticMarkup(await Page()), expected);
  }
});

test('carousel derives its exact selection, titles and image names from stable catalog IDs', () => {
  const catalog = load('lib/materials/catalog.ts', name => require(path.join(root, 'lib/materials', name)));
  assert.deepEqual(catalog.carouselMaterials, baseline.carousel);
  for (const item of catalog.carouselMaterials) for (const width of [260, 520, 780]) {
    assert.ok(fs.existsSync(path.join(root, 'public/materials-covers', `${item.image}-${width}.webp`)));
  }
});

test('import planning is idempotent, preserves changed existing records and never keys by title or checkout URL', () => {
  const rows = initialRecords();
  const first = planImport([]);
  assert.deepEqual(first.create, rows);
  const second = planImport(first.create);
  assert.equal(second.create.length, 0); assert.equal(second.preserved.length, 15);
  assert.equal(second.conflicts.length, 0);
  rows[0] = { ...rows[0], title: 'Changed only in memory' };
  const snapshot = JSON.stringify(rows);
  const conflict = planImport(rows);
  assert.deepEqual(conflict.conflicts, [rows[0].id]); assert.equal(conflict.create.length, 0);
  assert.equal(JSON.stringify(rows), snapshot);
  assert.equal(new Set(first.create.map(row => row.id)).size, 15);
  for (const [index, row] of first.create.entries()) {
    assert.equal(`R$ ${(row.priceCents / 100).toFixed(2).replace('.', ',')}`, materials[index].price);
    assert.equal(row.checkoutUrl, materials[index].checkoutUrl);
    assert.equal(row.description, null); assert.equal(row.status, 'PUBLISHED');
  }
  assert.throws(() => planImport([rows[0], rows[0]]), /DUPLICATE_MATERIAL_ID/);
});

// Admin page dependencies. In these tests material persistence is disabled (as in production today),
// so the page must fall back to the read-only catalog and never render the management panel.
class MaterialError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
const disabledMaterials = { getMaterials: () => { throw new MaterialError(503, 'MATERIALS_PERSISTENCE_DISABLED'); } };
/** Real lib/materials/pages.ts with an injected material server. */
function pagesWith(server) {
  return load('lib/materials/pages.ts', name => ({
    './server': server, './service-core': { MaterialError }, './catalog': { materials }, './price': load('lib/materials/price.ts'),
  })[name] ?? assert.fail(`unexpected import ${name}`));
}
function publicImports(pages) {
  const visual = visualImports(async () => assert.fail('public page must not require access'));
  return name => {
    if (name === 'next/link') return { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };
    if (name === '@/components/layout/Container') return { Container: ({ children }) => React.createElement('div', { className: 'container' }, children) };
    if (name === '@/components/materials/MaterialCard') return load('components/materials/MaterialCard.tsx', visual);
    if (name === '@/lib/materials/pages') return pages;
    return visual(name);
  };
}
function visualImports(guard) {
  return name => {
    if (name === '@/lib/materials/catalog') return { materials };
    if (name === '@/lib/materials/pages') return pagesWith(disabledMaterials);
    if (name === '@/lib/materials/server') return disabledMaterials;
    if (name === '@/lib/materials/service-core') return { MaterialError };
    if (name === '@/lib/storage/server') return { getPrivateStorage: () => ({ configured: false }) };
    if (name === '@/lib/materials/types') return load('lib/materials/types.ts');
    if (name === '@/components/materials/MaterialManager') return { MaterialManager: () => assert.fail('management panel rendered without persistence') };
    if (name === '@/components/materials/MaterialCatalogReadOnly') return load('components/materials/MaterialCatalogReadOnly.tsx', visualImports(guard));
    if (name === '@/lib/auth/page-access') return { requirePageAccess: guard };
    if (name === '@/components/library/MaterialLibraryCard') return load('components/library/MaterialLibraryCard.tsx', visualImports(guard));
    if (name.endsWith('/AdminLayout')) return { AdminLayout: ({ children }) => React.createElement('main', null, children) };
    if (name.endsWith('/MemberLayout')) return { MemberLayout: ({ children }) => React.createElement('main', null, children) };
    if (name === '@/components/ui/card') return { Card: props => React.createElement('section', props) };
    if (name === '@/components/ui/button') return { Button: props => React.createElement('button', props) };
    if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
    return require(name);
  };
}

test('student and admin use the same 15 products; no download links or simulated write controls', async () => {
  for (const [file, access] of [['app/aluno/recursos/page.tsx', 'subscriber'], ['app/admin/recursos/page.tsx', 'admin']]) {
    const Page = load(file, visualImports(async role => { assert.equal(role, access); return { user: {} }; })).default;
    const html = renderToStaticMarkup(await Page());
    assert.equal((html.match(/<img /g) ?? []).length, 15);
    assert.doesNotMatch(html, /href=|download=|\/pdfs\/|storageKey|Jogo da Memória das Emoções/);
    if (access === 'subscriber') {
      assert.equal((html.match(/PDF ainda indisponível/g) ?? []).length, 15);
      assert.doesNotMatch(html, /R\$|Comprar|hotmart/);
    } else {
      assert.match(html, /modo de consulta/);
      assert.doesNotMatch(html, /<button/);
    }
  }
});

test('real server authorization blocks STUDENT admin entry and expired subscription before rendering library', async () => {
  const { createAuthorization } = load('lib/auth/authorization-core.ts');
  const at = new Date();
  let role = 'STUDENT', active = false;
  const guards = createAuthorization({ api: { getSession: async () => ({ user: { id: 'memory-only' }, session: { expiresAt: new Date(at.getTime() + 60000) } }) } }, {
    user: { findUnique: async () => ({ id: 'memory-only', role, disabledAt: null }) },
    subscription: { findFirst: async args => {
      assert.deepEqual(args.where.endDate, { gt: at });
      assert.deepEqual(args.where.startDate, { lte: at });
      assert.equal(args.where.status, 'active');
      return active ? { id: 'memory-only' } : null;
    } },
  }, async () => new Headers(), () => at);
  const imports = visualImports(access => access === 'admin' ? guards.requireAdmin() : guards.requireActiveSubscription());
  const Admin = load('app/admin/recursos/page.tsx', imports).default;
  const Student = load('app/aluno/recursos/page.tsx', imports).default;
  await assert.rejects(Admin(), e => e.code === 'FORBIDDEN');
  await assert.rejects(Student(), e => e.code === 'SUBSCRIPTION_REQUIRED');
  role = 'ADMIN'; assert.ok(await Admin());
  role = 'STUDENT'; active = true; assert.ok(await Student());
});

test('authentication, payments, lessons, schema and approved layouts remain byte-identical', () => {
  for (const [file, hash] of Object.entries(baseline.protectedFiles)) {
    let bytes = fs.readFileSync(path.join(root, file));
    if (file === 'prisma/schema.prisma') {
      const source = bytes.toString('utf8');
      const marker = '\n// Catalog models: applied only to the explicitly authorized local test database.';
      const start = source.indexOf(marker);
      if (start !== -1) {
        const proposal = fs.readFileSync(path.join(root, 'prisma/proposals/materials.prisma'), 'utf8');
        assert.equal(source.slice(start + 1), proposal.replace('// Proposal fragment only. Not loaded by the application. Migration not approved.', marker.slice(1)));
        bytes = Buffer.from(source.slice(0, start));
      }
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, file);
  }
});

test('schema proposal and SQL are additive; no seed, overwrite or physical deletion', () => {
  const sql = fs.readFileSync(path.join(root, 'prisma/proposals/materials.sql'), 'utf8');
  assert.doesNotMatch(sql, /\b(?:DROP|DELETE|TRUNCATE|INSERT|UPDATE)\s+(?:TABLE|FROM|INTO|"|materials)/i);
  assert.match(sql, /ON DELETE RESTRICT/);
});

// Etapa B replaced the former "routes must not exist" guard: the routes now exist, so the guard
// asserts how they are allowed to exist (exact route set, server-side guard, no DB/env/storage access).
test('material API routes are exactly the approved set, guarded server-side and free of direct DB or storage access', () => {
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  const relative = dir => walk(path.join(root, dir)).map(file => path.relative(root, file).split(path.sep).join('/')).sort();
  assert.deepEqual(relative('app/api/admin/materials'), [
    'app/api/admin/materials/[id]/pdf/route.ts', 'app/api/admin/materials/[id]/route.ts',
    'app/api/admin/materials/order/route.ts', 'app/api/admin/materials/route.ts',
  ]);
  assert.deepEqual(relative('app/api/materials'), ['app/api/materials/[id]/download/route.ts']);
  for (const file of [...relative('app/api/admin/materials'), ...relative('app/api/materials')]) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const guard = file.startsWith('app/api/admin/') ? 'await requireAdmin()' : 'await requireActiveSubscription()';
    const handlers = source.match(/export function (?:GET|POST|PUT|PATCH|DELETE)\b[\s\S]*?\n}/g) ?? [];
    assert.ok(handlers.length > 0, file);
    for (const handler of handlers) assert.ok(handler.includes(guard), `${file} handler without ${guard}`);
    assert.match(source, /export const runtime = "nodejs"/); assert.match(source, /export const dynamic = "force-dynamic"/);
    for (const forbidden of ['@prisma/client', 'PrismaClient', 'storageKey', 'DATABASE_URL', 'R2_', 'public/']) {
      assert.ok(!source.includes(forbidden), `${file} must not contain ${forbidden}`);
    }
  }
});

test('no PDF is shipped publicly: public/ contains no PDF files', () => {
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [entry.name]);
  assert.deepEqual(walk(path.join(root, 'public')).filter(name => /\.pdf$/i.test(name)), []);
});
