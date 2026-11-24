// Pure planning only: no Prisma import, environment loading or database connection.
const catalog = require('../lib/materials/catalog.json');

/** Import rule: a material without a Hotmart link cannot be published (same rule as the admin service). */
const publicationStatus = checkoutUrl => (checkoutUrl ? 'PUBLISHED' : 'DRAFT');

/**
 * The 15 initial records, exactly as in lib/materials/catalog.json: id, title, price, cover, checkout link
 * (kept verbatim, including the empty link of material-initial-014), Premium flag and position.
 * Only status is derived: materials without a link are imported as DRAFT.
 */
function initialRecords() {
  return catalog.map((item, index) => {
    if (!/^R\$ \d+,\d{2}$/.test(item.price)) throw new Error('INVALID_SOURCE_PRICE');
    const [reais, cents] = item.price.slice(3).split(',').map(Number);
    return { id: item.id, title: item.title, description: null,
      priceCents: reais * 100 + cents, currency: 'BRL', coverImage: item.image,
      checkoutUrl: item.checkoutUrl, isPremium: item.isPremium ?? false,
      displayOrder: index, status: publicationStatus(item.checkoutUrl) };
  });
}

class ImportConflictError extends Error {
  constructor(conflicts) { super('MATERIAL_IMPORT_CONFLICT'); this.code = 'MATERIAL_IMPORT_CONFLICT'; this.conflicts = conflicts; }
}

/**
 * Plans an all-or-nothing import against the rows already stored.
 * - Duplicate IDs (stored or in the catalog) abort with DUPLICATE_MATERIAL_ID.
 * - Any stored catalog ID whose values differ aborts with MATERIAL_IMPORT_CONFLICT (nothing is inserted).
 * - Stored rows that are not in the catalog ("extras") are listed and never touched.
 * Existing rows are never updated or deleted.
 */
function planImport(existing) {
  const rows = initialRecords();
  const known = new Map(existing.map(row => [row.id, row]));
  if (known.size !== existing.length || new Set(rows.map(row => row.id)).size !== rows.length) {
    throw new Error('DUPLICATE_MATERIAL_ID');
  }
  const conflicts = rows.filter(row => known.has(row.id))
    .map(row => ({ id: row.id, fields: Object.keys(row).filter(key => known.get(row.id)[key] !== row[key]) }))
    .filter(conflict => conflict.fields.length > 0);
  if (conflicts.length) throw new ImportConflictError(conflicts);
  const catalogIds = new Set(rows.map(row => row.id));
  return {
    create: rows.filter(row => !known.has(row.id)),
    preserved: rows.filter(row => known.has(row.id)).map(row => row.id),
    extras: existing.filter(row => !catalogIds.has(row.id)).map(row => row.id),
  };
}

/** Human-readable effect of the import, documented in docs/producao-migracao/README.md. */
function importSummary() {
  const rows = initialRecords();
  const byLink = new Map();
  for (const row of rows) if (row.checkoutUrl) byLink.set(row.checkoutUrl, [...(byLink.get(row.checkoutUrl) ?? []), row.id]);
  return {
    total: rows.length,
    published: rows.filter(row => row.status === 'PUBLISHED').map(row => row.id),
    draft: rows.filter(row => row.status === 'DRAFT').map(row => row.id),
    sharedCheckoutUrl: [...byLink.values()].filter(ids => ids.length > 1),
  };
}

module.exports = { initialRecords, planImport, importSummary, ImportConflictError };
if (require.main === module) {
  console.log(JSON.stringify({ mode: 'OFFLINE_PLAN_ONLY', summary: importSummary(), ...planImport([]) }, null, 2));
}
