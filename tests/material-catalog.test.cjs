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
function load(file, imports = require) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8').replace('import "server-only";', ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const m = { exports: {} }; new Function('require', 'module', 'exports', code)(imports, m, m.exports); return m.exports;
}

test('all 15 commercial products retain exact values, optional properties, order and public markup', () => {
  assert.equal(materials.length, 15);
  assert.equal(new Set(materials.map(x => x.id)).size, 15);
  assert.deepEqual(materials.map(({ id, ...data }) => data), baseline.products);
  const source = fs.readFileSync(path.join(root, 'app/materiais/page.tsx'), 'utf8');
  assert.equal(source.slice(source.indexOf('export default')), baseline.publicMarkup);
  assert.match(source, /@\/lib\/materials\/catalog/);
  assert.equal(materials[13].checkoutUrl, '');
  assert.equal(materials[4].checkoutUrl, materials[5].checkoutUrl);
  for (const material of materials) assert.ok(fs.existsSync(path.join(root, 'public', material.image)));
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

function visualImports(guard) {
  return name => {
    if (name === '@/lib/materials/catalog') return { materials };
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

test('schema proposal and SQL are additive; no seed, overwrite, physical deletion or download routes', () => {
  const sql = fs.readFileSync(path.join(root, 'prisma/proposals/materials.sql'), 'utf8');
  assert.doesNotMatch(sql, /\b(?:DROP|DELETE|TRUNCATE|INSERT|UPDATE)\s+(?:TABLE|FROM|INTO|"|materials)/i);
  assert.match(sql, /ON DELETE RESTRICT/);
  assert.ok(!fs.existsSync(path.join(root, 'app/api/admin/materials')));
  assert.ok(!fs.existsSync(path.join(root, 'app/api/materials')));
});
