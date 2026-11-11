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
    assert.deepEqual(before.map(({ createdAt, updatedAt, ...row }) => row), initialRecords());
    assert.equal(await db.materialAsset.count(), 0);
    let rejected = 0;
    try {
      await db.$transaction(async tx => {
        await verifyServer(tx);
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(61420320)');
        await tx.$executeRawUnsafe('LOCK TABLE public.materials, public.material_assets IN SHARE ROW EXCLUSIVE MODE');
        await tx.material.update({ where: { id: before[0].id }, data: { title: 'TESTE ADMIN SOMENTE EM TRANSACAO', priceCents: 12345 } });
        const result = await insertMissing(tx);
        assert.equal(result.inserted, 0);
        assert.deepEqual(result.conflicts, [before[0].id]);
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
    console.log('PASS 15 exact Prisma records, 7 Premium badges, 0 assets; ADMIN edit preserved by importer; 4 invalid writes rejected; full rollback verified');
    assert.equal(before.filter(x => x.isPremium).length, 7);
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error('MATERIAL_VERIFICATION_FAILED', error.code || error.name); process.exitCode = 1; });
