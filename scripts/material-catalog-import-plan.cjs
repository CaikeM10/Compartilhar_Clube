// Pure planning only: no Prisma import, environment loading or database connection.
const catalog = require('../lib/materials/catalog.json');

function initialRecords() {
  return catalog.map((item, index) => {
    if (!/^R\$ \d+,\d{2}$/.test(item.price)) throw new Error('INVALID_SOURCE_PRICE');
    const [reais, cents] = item.price.slice(3).split(',').map(Number);
    return { id: item.id, title: item.title, description: null,
      priceCents: reais * 100 + cents, currency: 'BRL', coverImage: item.image,
      checkoutUrl: item.checkoutUrl, isPremium: item.isPremium ?? false,
      displayOrder: index, status: 'PUBLISHED' };
  });
}

/** Existing IDs are never updated or deleted, even when their values differ. */
function planImport(existing) {
  const rows = initialRecords();
  const known = new Map(existing.map(row => [row.id, row]));
  if (known.size !== existing.length || new Set(rows.map(row => row.id)).size !== rows.length) {
    throw new Error('DUPLICATE_MATERIAL_ID');
  }
  return {
    create: rows.filter(row => !known.has(row.id)),
    preserved: rows.filter(row => known.has(row.id)).map(row => row.id),
    conflicts: rows.filter(row => known.has(row.id) && Object.entries(row).some(([key, value]) => known.get(row.id)[key] !== value)).map(row => row.id),
  };
}

module.exports = { initialRecords, planImport };
if (require.main === module) {
  console.log(JSON.stringify({ mode: 'OFFLINE_PLAN_ONLY', ...planImport([]) }, null, 2));
}
