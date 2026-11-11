// In-memory only: no database, no network, no environment files.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
function load(file, imports) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8').replace('import "server-only";', ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const resolve = typeof imports === 'function' ? imports : name => (Object.hasOwn(imports, name) ? imports[name] : require(name));
  new Function('require', 'module', 'exports', code)(resolve, module, module.exports);
  return module.exports;
}
const catalog = require('../lib/materials/catalog.json');
const price = load('lib/materials/price.ts', {});
const authorization = load('lib/auth/authorization-core.ts', {});
class MaterialError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
const disabled = { getMaterials: () => { throw new MaterialError(503, 'MATERIALS_PERSISTENCE_DISABLED'); } };
const enabled = service => ({ getMaterials: () => service });
const pagesWith = server => load('lib/materials/pages.ts', { './server': server, './service-core': { MaterialError }, './catalog': { materials: catalog }, './price': price });

// Rows as returned by the service, plus private columns that must never leak if a select ever widened.
const leaky = { storageKey: 'materials/x/v1-secret.pdf', status: 'PUBLISHED', updatedAt: new Date(), assets: [{ storageKey: 'materials/secret.pdf' }] };
const publishedRows = [
  { id: 'b', title: 'Segundo (editado)', description: 'Desc', priceCents: 1990, currency: 'BRL', coverImage: '/arraiá.webp', checkoutUrl: null, isPremium: true, ...leaky },
  { id: 'a', title: 'Primeiro', description: null, priceCents: 490, currency: 'BRL', coverImage: '/aprendendofelicidade.webp', checkoutUrl: 'https://go.hotmart.com/X1?ap=1', isPremium: false, ...leaky },
];

test('public catalog reflects the database: admin order, edited title/price, Hotmart link intact, whitelisted fields only', async () => {
  const items = await pagesWith(enabled({ listPublished: async () => publishedRows })).getPublicCatalog();
  assert.deepEqual(items, [
    { id: 'b', title: 'Segundo (editado)', price: 'R$ 19,90', checkoutUrl: '', image: '/arraiá.webp', isPremium: true },
    { id: 'a', title: 'Primeiro', price: 'R$ 4,90', checkoutUrl: 'https://go.hotmart.com/X1?ap=1', image: '/aprendendofelicidade.webp', isPremium: false },
  ]);
  assert.doesNotMatch(JSON.stringify(items), /secret|storageKey|PUBLISHED|updatedAt/);
});

test('library reflects the database with hasPdf and no private or commercial fields', async () => {
  const rows = publishedRows.map(({ priceCents, checkoutUrl, ...row }, index) => ({ ...row, hasPdf: index === 1 }));
  const items = await pagesWith(enabled({ listLibrary: async () => rows })).getLibrary();
  assert.deepEqual(items, [
    { id: 'b', title: 'Segundo (editado)', description: 'Desc', image: '/arraiá.webp', hasPdf: false },
    { id: 'a', title: 'Primeiro', description: null, image: '/aprendendofelicidade.webp', hasPdf: true },
  ]);
  assert.doesNotMatch(JSON.stringify(items), /secret|storageKey|price|checkout|hotmart/i);
});

test('static catalog is used only when persistence is explicitly disabled, never offering downloads', async () => {
  const pages = pagesWith(disabled);
  const publicItems = await pages.getPublicCatalog();
  assert.deepEqual(publicItems.map(item => [item.id, item.title, item.price, item.checkoutUrl, item.image]), catalog.map(item => [item.id, item.title, item.price, item.checkoutUrl, item.image]));
  const library = await pages.getLibrary();
  assert.equal(library.length, 15); assert.ok(library.every(item => item.hasPdf === false));
});

test('database, authorization and other failures propagate instead of being masked as the static catalog', async () => {
  const failures = [new Error('connection refused'), new MaterialError(503, 'MATERIALS_UNAVAILABLE'), new authorization.AuthorizationError(403, 'SUBSCRIPTION_REQUIRED')];
  for (const failure of failures) {
    const pages = pagesWith(enabled({ listPublished: async () => { throw failure; }, listLibrary: async () => { throw failure; } }));
    await assert.rejects(pages.getPublicCatalog(), error => error === failure);
    await assert.rejects(pages.getLibrary(), error => error === failure);
  }
  const broken = { getMaterials: () => { throw new Error('infrastructure'); } };
  await assert.rejects(pagesWith(broken).getPublicCatalog(), /infrastructure/);
  await assert.rejects(pagesWith(broken).getLibrary(), /infrastructure/);
});

const ui = {
  '@/components/ui/card': { Card: ({ children, ...props }) => React.createElement('section', props, children) },
  // Mirrors Radix Slot: with asChild the child element is rendered instead of a <button>.
  '@/components/ui/button': { Button: ({ asChild, children, ...props }) => asChild ? children : React.createElement('button', props, children) },
  'lucide-react': new Proxy({}, { get: () => () => null }),
};
const card = load('components/library/MaterialLibraryCard.tsx', ui);

function studentPage({ guard, getLibrary }) {
  return load('app/aluno/recursos/page.tsx', {
    '@/components/layout/MemberLayout': { MemberLayout: ({ children }) => React.createElement('main', null, children) },
    '@/lib/auth/page-access': { requirePageAccess: guard },
    '@/lib/materials/pages': { getLibrary },
    '@/components/library/MaterialLibraryCard': card,
  }).default;
}

test('library page: subscriber guard runs before any read; without subscription nothing is queried', async () => {
  const log = [];
  const Page = studentPage({
    guard: async access => { log.push(`guard:${access}`); throw new authorization.AuthorizationError(403, 'SUBSCRIPTION_REQUIRED'); },
    getLibrary: async () => { log.push('read'); return []; },
  });
  await assert.rejects(Page(), error => error.code === 'SUBSCRIPTION_REQUIRED');
  assert.deepEqual(log, ['guard:subscriber']);
});

test('library page: published items in order, download only through the protected endpoint, unavailable state otherwise', async () => {
  const items = [
    { id: 'material-initial-002', title: 'Com PDF', description: 'Atualizada no painel', image: '/a.webp', hasPdf: true },
    { id: 'x y', title: 'Sem PDF', description: null, image: '/b.webp', hasPdf: false },
  ];
  const html = renderToStaticMarkup(await studentPage({ guard: async () => ({ user: {} }), getLibrary: async () => items })());
  assert.ok(html.indexOf('Com PDF') < html.indexOf('Sem PDF'));
  assert.match(html, /Atualizada no painel/);
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map(match => match[1]);
  assert.deepEqual(hrefs, ['/api/materials/material-initial-002/download']);
  assert.equal((html.match(/PDF ainda indisponível/g) ?? []).length, 1);
  assert.match(html, /Baixar PDF/);
  assert.doesNotMatch(html, /storageKey|storage\.invalid|R\$|Comprar|hotmart|download=/);
  // A card without hasPdf never links, even if an id is present; ids are URL-encoded.
  const encoded = renderToStaticMarkup(React.createElement(card.MaterialLibraryCard, { id: '../x', title: 't', image: '/i.webp', hasPdf: true }));
  assert.match(encoded, /href="\/api\/materials\/\.\.%2Fx\/download"/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(card.MaterialLibraryCard, { id: 'a', title: 't', image: '/i.webp' })), /href=/);
});

test('library page: empty state and errors are not hidden', async () => {
  const empty = renderToStaticMarkup(await studentPage({ guard: async () => ({ user: {} }), getLibrary: async () => [] })());
  assert.match(empty, /Nenhum material disponível no momento/);
  await assert.rejects(studentPage({ guard: async () => ({ user: {} }), getLibrary: async () => { throw new Error('db down'); } })(), /db down/);
  assert.match(fs.readFileSync(path.join(root, 'app/aluno/recursos/error.tsx'), 'utf8'), /Biblioteca temporariamente indisponível/);
});

test('public page: no authentication, ISR with on-demand revalidation, renders only what the data layer returns', async () => {
  const source = fs.readFileSync(path.join(root, 'app/materiais/page.tsx'), 'utf8');
  assert.doesNotMatch(source, /["']use client["']|@\/lib\/auth|requirePageAccess|cookies\(|headers\(/);
  const visual = name => ({
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
    '@/components/layout/Container': { Container: ({ children }) => React.createElement('div', null, children) },
    '@/components/materials/MaterialCard': { MaterialCard: props => React.createElement('article', null, `${props.title}|${props.price}|${props.checkoutUrl}`) },
    'lucide-react': ui['lucide-react'],
    '@/lib/materials/pages': { getPublicCatalog: async () => [{ id: 'a', title: 'Só publicado', price: 'R$ 1,00', checkoutUrl: 'https://go.hotmart.com/Z', image: '/a.webp', isPremium: false }] },
  })[name] ?? (name === 'react/jsx-runtime' ? require(name) : assert.fail(`unexpected import ${name}`));
  const module = load('app/materiais/page.tsx', visual);
  assert.equal(module.revalidate, 300);
  const html = renderToStaticMarkup(await module.default());
  assert.equal((html.match(/<article>/g) ?? []).length, 1);
  assert.match(html, /Só publicado\|R\$ 1,00\|https:\/\/go\.hotmart\.com\/Z/);
  assert.match(fs.readFileSync(path.join(root, 'app/materiais/error.tsx'), 'utf8'), /Catálogo temporariamente indisponível/);
});

test('admin writes revalidate the storefront and library only after success', async () => {
  const routes = [
    ['app/api/admin/materials/route.ts', 'POST', 'create'],
    ['app/api/admin/materials/[id]/route.ts', 'PATCH', 'change'],
    ['app/api/admin/materials/order/route.ts', 'PUT', 'reorder'],
    ['app/api/admin/materials/[id]/pdf/route.ts', 'POST', 'pdf'],
    ['app/api/admin/materials/[id]/pdf/route.ts', 'DELETE', 'removePdf'],
  ];
  for (const [file, method, operation] of routes) {
    for (const outcome of ['ok', 'conflict', 'forbidden', 'invalid']) {
      let revalidations = 0;
      const http = load('lib/materials/http.ts', {
        '@/lib/auth/authorization-core': authorization, '@/lib/lessons/service-core': { LessonError: MaterialError },
        '@/lib/lessons/http': { mutationBody: async () => { if (outcome === 'invalid') throw new MaterialError(400, 'INVALID_JSON'); return {}; } },
        '@/lib/storage/private-storage': { StorageError: MaterialError }, './service-core': { MaterialError },
      });
      const route = load(file, {
        '@/lib/materials/server': { getMaterials: () => ({ [operation]: async () => { if (outcome === 'conflict') throw new MaterialError(409, 'MATERIAL_CHANGED_OR_MISSING'); return { ok: true }; } }) },
        '@/lib/materials/http': http, '@/lib/auth/config': { readAuthEnvironment: () => ({ baseURL: 'http://127.0.0.1:3000' }) },
        '@/lib/auth/authorization': { requireAdmin: async () => { if (outcome === 'forbidden') throw new authorization.AuthorizationError(403, 'FORBIDDEN'); } },
        '@/lib/materials/revalidate': { revalidateMaterialPages: () => { revalidations++; } },
      });
      const response = await route[method](new Request('http://127.0.0.1:3000/x', { method }), { params: Promise.resolve({ id: 'material-initial-001' }) });
      assert.equal(revalidations, outcome === 'ok' ? 1 : 0, `${file} ${method} ${outcome}`);
      assert.equal(response.status, { ok: method === 'POST' && operation === 'create' ? 201 : 200, conflict: 409, forbidden: 403, invalid: 400 }[outcome]);
    }
  }
  const source = fs.readFileSync(path.join(root, 'lib/materials/revalidate.ts'), 'utf8');
  assert.match(source, /revalidatePath\("\/materiais"\)/); assert.match(source, /revalidatePath\("\/aluno\/recursos"\)/);
  assert.doesNotMatch(source, /revalidatePath\("\/"\s*,\s*"layout"\)/, 'no global cache purge');
});
