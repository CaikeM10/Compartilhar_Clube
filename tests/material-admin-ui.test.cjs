// In-memory only: no database, no network, no environment files.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
function load(file, overrides = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8').replace('import "server-only";', ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(overrides, name) ? overrides[name] : require(name), module, module.exports);
  return module.exports;
}
const catalog = require('../lib/materials/catalog.json');
const validation = load('lib/materials/validation.ts');
const price = load('lib/materials/price.ts');
const types = load('lib/materials/types.ts');
const client = load('lib/materials/admin-client.ts', { './price': price });

const view = (overrides = {}) => ({
  id: 'material-initial-001', title: 'Aprendendo felicidade', description: null, priceCents: 490, currency: 'BRL',
  coverImage: '/aprendendofelicidade.webp', checkoutUrl: 'https://go.hotmart.com/X1', isPremium: false, displayOrder: 0,
  status: 'PUBLISHED', updatedAt: '2026-11-06T00:00:00.000Z', assets: [], ...overrides,
});
const form = (overrides = {}) => ({ title: 'Novo', description: '', price: '4,90', coverImage: '/aprendendofelicidade.webp', checkoutUrl: '', isPremium: false, displayOrder: '16', ...overrides });

test('price formatting reproduces every current catalog price and parsing never uses floats', () => {
  for (const material of catalog) {
    const cents = price.parsePriceToCents(material.price);
    assert.ok(Number.isInteger(cents), material.price);
    assert.equal(price.formatPriceCents(cents), material.price);
  }
  for (const [raw, cents] of [['4,90', 490], ['4.90', 490], ['4', 400], ['0,1', 10], ['1.234,56', 123456], ['R$ 12,00', 1200], ['0,29', 29], ['19,99', 1999]]) {
    assert.equal(price.parsePriceToCents(raw), cents, raw);
  }
  for (const raw of ['', '-1', '4,999', 'abc', '4,9a', '1,2,3', '99999999999', '4 90', '1.23.45']) assert.equal(price.parsePriceToCents(raw), null, raw);
  assert.equal(price.centsToInput(123456), '1.234,56');
  assert.equal(price.formatPriceCents(5), 'R$ 0,05');
});

test('create payload matches the server schema, converts reais to cents and positions from 1', () => {
  const body = client.buildMaterialInput(form({ description: '  ', checkoutUrl: ' ', isPremium: true }));
  assert.deepEqual(body, { title: 'Novo', description: null, priceCents: 490, coverImage: '/aprendendofelicidade.webp', checkoutUrl: null, isPremium: true, currency: 'BRL', displayOrder: 15 });
  assert.ok(validation.materialInput.safeParse(body).success);
  for (const bad of [{ price: 'x' }, { title: '  ' }, { coverImage: '' }, { displayOrder: '0' }, { displayOrder: '1.5' }]) {
    assert.throws(() => client.buildMaterialInput(form(bad)), client.MaterialFormError, JSON.stringify(bad));
  }
});

test('edit payload carries the optimistic token and only fields the administrator changed', () => {
  const material = view();
  const same = form({ title: material.title, price: '4,90', checkoutUrl: material.checkoutUrl });
  assert.equal(client.buildMaterialChange(material, same), null, 'unchanged form must not rewrite an existing material');
  const change = client.buildMaterialChange(material, { ...same, price: '5,50', description: 'Nova descrição' });
  assert.deepEqual(change, { expectedUpdatedAt: material.updatedAt, data: { description: 'Nova descrição', priceCents: 550 } });
  assert.ok(validation.materialChange.safeParse(change).success);
  assert.ok(!('displayOrder' in change.data) && !('status' in change.data));
  for (const status of ['PUBLISHED', 'DRAFT', 'ARCHIVED']) assert.ok(validation.materialChange.safeParse(client.buildStatusChange(material, status)).success);
});

test('reorder builds the complete list accepted by the server and refuses out-of-bounds moves', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(client.moveInOrder(ids, 1, 'up'), { order: ['b', 'a', 'c'] });
  assert.deepEqual(client.moveInOrder(ids, 1, 'down'), { order: ['a', 'c', 'b'] });
  assert.equal(client.moveInOrder(ids, 0, 'up'), null); assert.equal(client.moveInOrder(ids, 2, 'down'), null);
  assert.deepEqual(ids, ['a', 'b', 'c']);
  assert.ok(validation.materialOrder.safeParse(client.moveInOrder(ids, 0, 'down')).success);
});

test('every documented HTTP outcome has a specific message; 404/409 trigger a reload', () => {
  const codes = { 400: ['INVALID_MATERIAL', 'INVALID_ORDER', 'JSON_REQUIRED', 'BODY_TOO_LARGE'], 401: ['UNAUTHENTICATED'], 403: ['FORBIDDEN', 'INVALID_ORIGIN'],
    404: ['MATERIAL_NOT_FOUND'], 409: ['MATERIAL_CHANGED_OR_MISSING', 'MATERIAL_ORDER_STALE', 'PDF_CHANGED_OR_MISSING'],
    503: ['MATERIALS_PERSISTENCE_DISABLED', 'STORAGE_NOT_CONFIGURED', 'MATERIALS_UNAVAILABLE'] };
  const generic = client.materialErrorMessage(500);
  for (const [status, list] of Object.entries(codes)) {
    assert.notEqual(client.materialErrorMessage(Number(status)), generic, `fallback for ${status}`);
    for (const code of list) assert.notEqual(client.materialErrorMessage(Number(status), code), generic, code);
  }
  assert.equal(client.materialErrorMessage(401, 'UNAUTHENTICATED'), 'Sua sessão terminou. Entre novamente.');
  assert.deepEqual([400, 401, 403, 404, 409, 503].filter(client.shouldReload), [404, 409]);
});

test('adminRequest sends same-origin JSON without caching and surfaces only the error code', async () => {
  const calls = [];
  const fake = async (url, init) => { calls.push([url, init]); return url.endsWith('fail') ? new Response(JSON.stringify({ error: 'MATERIAL_ORDER_STALE' }), { status: 409 }) : Response.json([{ id: 'a' }]); };
  assert.deepEqual(await client.adminRequest(fake, '/api/admin/materials'), { ok: true, status: 200, data: [{ id: 'a' }] });
  assert.deepEqual(calls[0][1], { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
  assert.deepEqual(await client.adminRequest(fake, '/api/admin/materials/order/fail', 'PUT', { order: ['a'] }), { ok: false, status: 409, code: 'MATERIAL_ORDER_STALE' });
  assert.equal(calls[1][1].headers['Content-Type'], 'application/json'); assert.equal(calls[1][1].body, '{"order":["a"]}');
  assert.deepEqual(await client.adminRequest(async () => { throw new TypeError('offline'); }, '/x'), { ok: false, status: 0, code: 'NETWORK_ERROR' });
  assert.deepEqual(await client.adminRequest(async () => new Response('<html>', { status: 503 }), '/x'), { ok: false, status: 503, code: undefined });
});

test('view mapping whitelists fields: storage keys and extra columns never reach the browser', () => {
  const mapped = types.toMaterialAdminView({ ...view(), createdAt: new Date(), updatedAt: new Date('2026-11-06T00:00:00Z'), extra: 'x',
    assets: [{ id: 'v', originalFilename: 'a.pdf', fileSize: 10, version: 1, status: 'VALIDATED', createdAt: new Date(0), storageKey: 'materials/secret.pdf' }] });
  assert.equal(mapped.updatedAt, '2026-11-06T00:00:00.000Z');
  assert.ok(!JSON.stringify(mapped).includes('secret') && !('extra' in mapped) && !('createdAt' in mapped));
});

const ui = {
  '@/components/ui/card': { Card: ({ children, ...props }) => React.createElement('section', props, children) },
  '@/components/ui/button': { Button: ({ children, ...props }) => React.createElement('button', props, children) },
  '@/components/ui/input': { Input: props => React.createElement('input', props) },
  '@/components/ui/textarea': { Textarea: props => React.createElement('textarea', props) },
  '@/components/ui/dialog': {
    Dialog: ({ open, children }) => open ? React.createElement('dialog', null, children) : null,
    DialogContent: ({ children }) => children, DialogHeader: ({ children }) => children, DialogTitle: ({ children }) => children, DialogDescription: ({ children }) => children,
  },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/lib/materials/price': price, '@/lib/materials/admin-client': client, '@/lib/materials/types': types,
};
const { MaterialManager } = load('components/materials/MaterialManager.tsx', ui);
const render = props => renderToStaticMarkup(React.createElement(MaterialManager, { coverOptions: ['/aprendendofelicidade.webp'], storageConfigured: false, ...props }));

test('panel renders status, price in reais, PDF availability and the storage-unavailable notice without upload controls', () => {
  const html = render({ initialMaterials: [
    view(),
    view({ id: 'b', title: 'Rascunho B', status: 'DRAFT', priceCents: 1234, assets: [{ id: 'p', originalFilename: 'b.pdf', fileSize: 2048, version: 1, status: 'PENDING', createdAt: '2026-11-06T00:00:00.000Z' }] }),
    view({ id: 'c', title: 'Com PDF', assets: [{ id: 'v', originalFilename: 'guia.pdf', fileSize: 3 * 1024 * 1024, version: 2, status: 'VALIDATED', createdAt: '2026-11-06T00:00:00.000Z' }] }),
    view({ id: 'd', title: 'Antigo', status: 'ARCHIVED' }),
  ] });
  assert.match(html, /Publicado/); assert.match(html, /Rascunho/);
  assert.match(html, /R\$ 4,90/); assert.match(html, /R\$ 12,34/);
  assert.match(html, /PDF: nenhum arquivo associado/); assert.match(html, /PDF: envio pendente de validação/);
  assert.match(html, /PDF disponível: guia\.pdf · 3,0 MB · versão 2/);
  assert.match(html, /Envio de PDF indisponível/);
  assert.match(html, /Mostrar arquivados \(1\)/); assert.doesNotMatch(html, /Antigo/, 'archived materials collapsed by default');
  assert.equal((html.match(/<img /g) ?? []).length, 3);
  assert.match(html, /disabled=""[^>]*aria-label="Mover Aprendendo felicidade para cima"/);
  assert.match(html, /disabled=""[^>]*aria-label="Mover Com PDF para baixo"/);
  assert.doesNotMatch(html, /href=|download=|\/pdfs\/|storageKey|type="file"|Enviar PDF/);
});

test('panel shows empty and load-failure states without inventing data', () => {
  assert.match(render({ initialMaterials: [] }), /Nenhum material cadastrado/);
  const failed = render({ initialMaterials: null });
  assert.match(failed, /role="alert"/); assert.match(failed, /Não foi possível carregar os materiais/); assert.match(failed, /Atualizar lista/);
  assert.doesNotMatch(failed, /Envio de PDF indisponível/);
});

test('panel source talks only to the admin material API, blocks duplicate writes and confirms destructive actions', () => {
  const source = fs.readFileSync(path.join(root, 'components/materials/MaterialManager.tsx'), 'utf8');
  const urls = [...source.matchAll(/`([^`]*\/api\/[^`]*)`|"(\/api\/[^"]*)"/g)].map(match => match[1] ?? match[2]);
  assert.ok(urls.length > 0);
  for (const url of urls) assert.match(url, /^(\$\{BASE\}|\/api\/admin\/materials)/, url);
  assert.match(source, /const BASE = "\/api\/admin\/materials"/);
  assert.match(source, /if \(lock\.current\) return;/);
  assert.match(source, /Confirmar arquivamento/); assert.match(source, /Confirmar remoção/);
  assert.doesNotMatch(source, /createUploadUrl|storage\.invalid|action: "start"|action: "confirm"|public\//);
});

test('admin page: guard first; persistence on -> panel with serialized data; other failures -> error state', async () => {
  const log = [];
  const rows = [{ ...view(), updatedAt: new Date('2026-11-06T00:00:00Z'), createdAt: new Date(), assets: [] }];
  class MaterialError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
  let listAdmin = async () => { log.push('listAdmin'); return rows; };
  const imports = {
    '@/components/layout/AdminLayout': { AdminLayout: ({ children }) => React.createElement('main', null, children) },
    '@/lib/auth/page-access': { requirePageAccess: async access => { log.push(`guard:${access}`); return { user: {} }; } },
    '@/lib/materials/server': { getMaterials: () => ({ listAdmin: () => listAdmin() }) },
    '@/lib/materials/service-core': { MaterialError },
    '@/lib/storage/server': { getPrivateStorage: () => ({ configured: false }) },
    '@/lib/materials/catalog': { materials: catalog },
    '@/lib/materials/types': types,
    '@/components/materials/MaterialManager': { MaterialManager: props => { log.push(props); return React.createElement('div', null, 'panel'); } },
    '@/components/materials/MaterialCatalogReadOnly': { MaterialCatalogReadOnly: () => React.createElement('div', null, 'read-only') },
  };
  const Page = load('app/admin/recursos/page.tsx', imports).default;
  assert.equal(renderToStaticMarkup(await Page()), '<main><div>panel</div></main>');
  assert.deepEqual(log.slice(0, 2), ['guard:admin', 'listAdmin']);
  const props = log[2];
  assert.equal(props.initialMaterials[0].updatedAt, '2026-11-06T00:00:00.000Z'); assert.ok(!('createdAt' in props.initialMaterials[0]));
  assert.equal(props.storageConfigured, false);
  assert.equal(props.coverOptions.length, new Set(catalog.map(m => m.image)).size);
  listAdmin = async () => { throw new Error('database down'); }; log.length = 0;
  renderToStaticMarkup(await Page()); assert.equal(log[1].initialMaterials, null);
  listAdmin = async () => { throw new MaterialError(503, 'MATERIALS_PERSISTENCE_DISABLED'); };
  assert.equal(renderToStaticMarkup(await Page()), '<main><div>read-only</div></main>');
  imports['@/lib/auth/page-access'].requirePageAccess = async () => { throw Object.assign(new Error('FORBIDDEN'), { code: 'FORBIDDEN' }); };
  listAdmin = async () => assert.fail('materials read before authorization');
  await assert.rejects(load('app/admin/recursos/page.tsx', imports).default(), error => error.code === 'FORBIDDEN');
});
