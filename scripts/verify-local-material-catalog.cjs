const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { loadTarget, verifyServer } = require('./auth-test-safety.cjs');
const { initialRecords } = require('./material-catalog-import-plan.cjs');
const { insertMissing, schemaEvidence } = require('./local-material-catalog.cjs');
async function main() {
  const db = new PrismaClient({ datasources: { db: { url: loadTarget(process.cwd()) } }, log: [] });
  const rollback = new Error('EXPECTED_TEST_ROLLBACK');
  try {
    await verifyServer(db);
    const before = await db.material.findMany({ orderBy: { id: 'asc' } });
    // Expected state = current import rule: 14 PUBLISHED and material-initial-014 as DRAFT (no Hotmart link).
    const stored = before.map(({ createdAt, updatedAt, ...row }) => row);
    const expected = initialRecords();
    const differing = expected.filter((row, i) => JSON.stringify(stored[i]) !== JSON.stringify(row)).map(row => row.id);
    const only014Status = stored.length === expected.length && differing.length === 1 && differing[0] === 'material-initial-014'
      && JSON.stringify({ ...stored[13], status: 'DRAFT' }) === JSON.stringify(expected[13]);
    // Imported before the rule existed: report it explicitly; this script never changes it (see README §12).
    if (only014Status) throw new Error('LOCAL_014_NEEDS_RECONCILIATION');
    assert.deepEqual(stored, expected);
    assert.equal(stored.find(row => row.id === 'material-initial-014').status, 'DRAFT');
    assert.equal(await db.materialAsset.count(), 0);
    let rejected = 0;
    try {
      await db.$transaction(async tx => {
        await verifyServer(tx);
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(61420320)');
        await tx.$executeRawUnsafe('LOCK TABLE public.materials, public.material_assets IN SHARE ROW EXCLUSIVE MODE');
        await tx.material.update({ where: { id: before[0].id }, data: { title: 'TESTE ADMIN SOMENTE EM TRANSACAO', priceCents: 12345 } });
        // Importer contract: a differing existing record aborts the whole import before any INSERT.
        let conflict;
        try { await insertMissing(tx); } catch (error) { conflict = error; }
        assert.equal(conflict?.code, 'MATERIAL_IMPORT_CONFLICT');
        assert.deepEqual(conflict.conflicts, [{ id: before[0].id, fields: ['title', 'priceCents'] }]);
        const changed = await tx.material.findUniqueOrThrow({ where: { id: before[0].id } });
        assert.equal(changed.priceCents, 12345);
        assert.equal(changed.title, 'TESTE ADMIN SOMENTE EM TRANSACAO');
        for (const sql of [
          `UPDATE public.materials SET "priceCents"=-1 WHERE id='material-initial-001'`,
          `UPDATE public.materials SET currency='USD' WHERE id='material-initial-001'`,
          `UPDATE public.materials SET "displayOrder"=-1 WHERE id='material-initial-001'`,
          `INSERT INTO public.material_assets (id,"materialId","storageKey","originalFilename","mimeType","fileSize",version,"updatedAt")
           VALUES ('verification-only','nonexistent-material','verification-only','test.pdf','application/pdf',1,1,CURRENT_TIMESTAMP)`,
        ]) {
          await tx.$executeRawUnsafe('SAVEPOINT invalid_input');
          try { await tx.$executeRawUnsafe(sql); }
          catch (error) { assert.ok(['23514', '23503'].includes(error.meta?.code)); rejected++; }
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT invalid_input');
        }
        assert.equal(rejected, 4);
        const evidence = await schemaEvidence(tx);
        assert.ok(evidence.constraints.some(x => x.definition.includes('ON UPDATE CASCADE ON DELETE RESTRICT')));
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    assert.deepEqual(await db.material.findMany({ orderBy: { id: 'asc' } }), before);
    assert.equal(await db.materialAsset.count(), 0);
    console.log('PASS 15 exact Prisma records (14 PUBLISHED + 014 DRAFT), 7 Premium badges, 0 assets; conflicting ADMIN edit aborts the importer; 4 invalid writes rejected; full rollback verified');
    assert.equal(before.filter(x => x.isPremium).length, 7);
  } finally { await db.$disconnect(); }
}
main().catch(error => {
  console.error('MATERIAL_VERIFICATION_FAILED', /^[A-Z0-9_]+$/.test(error.message || '') ? error.message : (error.code || error.name));
  process.exitCode = 1;
});
