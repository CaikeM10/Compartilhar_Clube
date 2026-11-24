// Offline only: Home carousel data rules (lib/materials/carousel-core.ts, getCarouselItems) and the server wrapper.
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
  new Function('require', 'module', 'exports', code)(imports, module, module.exports);
  return module.exports;
}
const fromMaterials = name => require(path.join(root, 'lib/materials', name));
const core = load('lib/materials/carousel-core.ts', fromMaterials);
const catalog = require('../lib/materials/catalog.json');
const selection = require('../lib/materials/carousel.json');
class MaterialError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }

function pagesWith(server) {
  return load('lib/materials/pages.ts', name => ({
    './server': server, './service-core': { MaterialError }, './catalog': { materials: catalog },
    './price': load('lib/materials/price.ts', require), './carousel-core': core,
  })[name] ?? assert.fail(`unexpected import ${name}`));
}
const disabled = { getMaterials: () => { throw new MaterialError(503, 'MATERIALS_PERSISTENCE_DISABLED'); } };
const enabled = rows => ({ getMaterials: () => ({ listPublished: async () => rows }) });
/** Rows as listPublished() returns them right after the import: PUBLISHED only (014 is DRAFT), catalog order. */
const importedRows = () => catalog.filter(item => item.checkoutUrl).map(item => ({ id: item.id, title: item.title, coverImage: item.image,
  description: null, priceCents: 0, currency: 'BRL', checkoutUrl: item.checkoutUrl, isPremium: false }));
const curatedIds = selection.map(entry => entry.materialId);

test('persistence disabled: exactly today\'s static carousel (curated order, alternative titles, responsive covers)', async () => {
  const result = await pagesWith(disabled).getCarouselItems();
  assert.equal(result.kind, 'ready');
  assert.deepEqual(result.items, core.staticCarousel());
  assert.deepEqual(result.items.map(item => item.id), curatedIds);
  assert.deepEqual(result.items.map(item => item.title).slice(-2), ['Não aceitamos fiado', 'Aprendendo Felicidade']);
  for (const item of result.items) {
    assert.match(item.src, /^\/materials-covers\/.+-520\.webp$/);
    assert.equal(item.srcSet.split(', ').length, 3);
  }
});

test('persistence enabled, right after the import: same ten items and titles, in the administrator order', async () => {
  const result = await pagesWith(enabled(importedRows())).getCarouselItems();
  const expectedOrder = importedRows().map(row => row.id).filter(id => curatedIds.includes(id));
  assert.deepEqual(result.items.map(item => item.id), expectedOrder);
  assert.equal(result.items.length, 10);
  const byId = Object.fromEntries(core.staticCarousel().map(item => [item.id, item]));
  // Same title and cover sources as today for every item: only the order follows displayOrder.
  for (const item of result.items) assert.deepEqual(item, byId[item.id]);
});

test('unpublished/archived curated materials are omitted; non-curated published rows are ignored', async () => {
  const rows = importedRows().filter(row => !['material-initial-010', 'material-initial-003'].includes(row.id));
  const result = await pagesWith(enabled(rows)).getCarouselItems();
  assert.equal(result.items.length, 8);
  assert.ok(!result.items.some(item => ['material-initial-010', 'material-initial-003'].includes(item.id)));
  assert.ok(!result.items.some(item => !curatedIds.includes(item.id)), 'only curated IDs');
  assert.deepEqual((await pagesWith(enabled([])).getCarouselItems()), { kind: 'ready', items: [] });
});

test('title rule: the curated alternative applies only while the stored title equals the original catalog title', async () => {
  const rows = importedRows();
  const renamed = rows.map(row => row.id === 'material-initial-012' ? { ...row, title: 'Não Aceitamos Fiado — edição 2' }
    : row.id === 'material-initial-010' ? { ...row, title: 'Marmita da Leitura (nova)' } : row);
  const items = Object.fromEntries((await pagesWith(enabled(renamed)).getCarouselItems()).items.map(item => [item.id, item.title]));
  assert.equal(items['material-initial-012'], 'Não Aceitamos Fiado — edição 2', 'administrator rename wins over the alternative');
  assert.equal(items['material-initial-010'], 'Marmita da Leitura (nova)', 'no alternative defined: stored title');
  assert.equal(items['material-initial-001'], 'Aprendendo Felicidade', 'unchanged title keeps the curated alternative');
});

test('covers: pre-resized variants only when they exist; otherwise the original image without srcSet', async () => {
  const rows = importedRows().map(row => row.id === 'material-initial-011' ? { ...row, coverImage: '/termometro.webp' }
    : row.id === 'material-initial-009' ? { ...row, coverImage: '/arraiá.webp' } : row);
  const items = Object.fromEntries((await pagesWith(enabled(rows)).getCarouselItems()).items.map(item => [item.id, item]));
  assert.deepEqual(items['material-initial-011'], { id: 'material-initial-011', title: 'Mood Kids', src: '/termometro.webp', srcSet: null });
  assert.equal(items['material-initial-009'].src, '/materials-covers/arraiá-520.webp');
  for (const item of Object.values(items)) {
    const urls = item.srcSet ? item.srcSet.split(', ').map(entry => entry.split(' ')[0]) : [item.src];
    for (const url of urls) assert.ok(fs.existsSync(path.join(root, 'public', decodeURIComponent(url))), `missing file for ${url}`);
  }
  for (const cover of ['/x.png', '/pasta/arraiá.webp', '/arraiá.webp?x', '/naoexiste.webp']) {
    assert.equal(core.coverSources(cover).srcSet, null, cover);
  }
});

test('database failure or incomplete migration with persistence enabled: explicit unavailable state, never the static catalog', async () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try {
    for (const server of [
      { getMaterials: () => ({ listPublished: async () => { throw Object.assign(new Error('relation "materials" does not exist secret'), { code: 'P2021' }); } }) },
      { getMaterials: () => ({ listPublished: async () => { throw new Error('connection refused to db.internal'); } }) },
      { getMaterials: () => { throw new Error('BETTER_AUTH_SECRET missing'); } },
    ]) {
      assert.deepEqual(await pagesWith(server).getCarouselItems(), { kind: 'unavailable' });
    }
  } finally { console.error = original; }
  assert.deepEqual(errors, [['HOME_CAROUSEL_UNAVAILABLE', 'P2021'], ['HOME_CAROUSEL_UNAVAILABLE', 'UNKNOWN'], ['HOME_CAROUSEL_UNAVAILABLE', 'UNKNOWN']]);
  assert.ok(!JSON.stringify(errors).match(/secret|db\.internal|BETTER_AUTH/), 'logs carry codes only');
});

test('Home server wrapper: notice when unavailable, nothing when empty, carousel with items otherwise', async () => {
  let carousel;
  let received;
  const Home = load('components/materials/HomeMaterialsCarousel.tsx', name => ({
    'next/link': { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) },
    '@/lib/materials/pages': { getCarouselItems: async () => carousel },
    '@/components/materials/MaterialsCarousel': { MaterialsCarousel: ({ items }) => { received = items; return React.createElement('div', { 'data-carousel': items.length }); } },
    'react/jsx-runtime': require('react/jsx-runtime'),
  })[name] ?? assert.fail(`unexpected import ${name}`)).HomeMaterialsCarousel;
  carousel = { kind: 'unavailable' };
  let html = renderToStaticMarkup(await Home());
  assert.match(html, /Materiais indisponíveis no momento/);
  assert.match(html, /href="\/materiais"/);
  assert.doesNotMatch(html, /data-carousel/);
  carousel = { kind: 'ready', items: [] };
  assert.equal(await Home(), null);
  carousel = { kind: 'ready', items: core.staticCarousel() };
  html = renderToStaticMarkup(await Home());
  assert.match(html, /data-carousel="10"/);
  assert.deepEqual(received, core.staticCarousel());
});

test('Home wiring: server wrapper replaces the static import, page revalidates and keeps the section markup', () => {
  const page = fs.readFileSync(path.join(root, 'app/page.tsx'), 'utf8');
  assert.match(page, /<HomeMaterialsCarousel \/>/);
  assert.doesNotMatch(page, /<MaterialsCarousel \/>/);
  assert.match(page, /export const revalidate = 300;/);
  assert.match(page, /<ScrollAnimation animation="fade-up" delay=\{150\}>\s*<HomeMaterialsCarousel \/>\s*<\/ScrollAnimation>/);
  const component = fs.readFileSync(path.join(root, 'components/materials/MaterialsCarousel.tsx'), 'utf8');
  assert.match(component, /^"use client";/);
  assert.doesNotMatch(component, /@\/lib\/materials\/catalog|catalog\.json|carousel\.json/, 'client bundle carries no catalog data');
});
