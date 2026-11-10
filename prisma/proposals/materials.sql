-- PROPOSAL ONLY. Approval required before execution. No data import.
BEGIN;
-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MaterialAssetStatus" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "coverImage" TEXT NOT NULL,
    "checkoutUrl" TEXT,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL,
    "status" "MaterialStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_assets" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksum" TEXT,
    "version" INTEGER NOT NULL,
    "status" "MaterialAssetStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "materials_status_displayOrder_idx" ON "materials"("status", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "material_assets_storageKey_key" ON "material_assets"("storageKey");

-- CreateIndex
CREATE INDEX "material_assets_materialId_status_idx" ON "material_assets"("materialId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "material_assets_materialId_version_key" ON "material_assets"("materialId", "version");

-- AddForeignKey
ALTER TABLE "material_assets" ADD CONSTRAINT "material_assets_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Additional invariants (partial index/checks are not expressed by Prisma 5).
ALTER TABLE "materials" ADD CONSTRAINT "materials_price_nonnegative" CHECK ("priceCents" >= 0);
ALTER TABLE "materials" ADD CONSTRAINT "materials_currency_brl" CHECK ("currency" = 'BRL');
ALTER TABLE "materials" ADD CONSTRAINT "materials_order_nonnegative" CHECK ("displayOrder" >= 0);
ALTER TABLE "material_assets" ADD CONSTRAINT "material_assets_size_positive" CHECK ("fileSize" > 0);
ALTER TABLE "material_assets" ADD CONSTRAINT "material_assets_version_positive" CHECK ("version" > 0);
ALTER TABLE "material_assets" ADD CONSTRAINT "material_assets_pdf_only" CHECK ("mimeType" = 'application/pdf');
ALTER TABLE "material_assets" ADD CONSTRAINT "material_assets_validated_checksum" CHECK (
  "status" <> 'VALIDATED' OR ("checksum" IS NOT NULL AND "checksum" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "material_assets_one_validated" ON "material_assets" ("materialId") WHERE "status" = 'VALIDATED';
COMMIT;
