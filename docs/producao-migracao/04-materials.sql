-- =====================================================================
-- 04 — MIGRAÇÃO INCREMENTAL: materiais (PROPOSTA — NÃO EXECUTADA)
-- =====================================================================
-- GERADO por scripts/material-production-sql.cjs a partir de lib/materials/catalog.json.
-- Não editar à mão: altere o gerador e rode `node scripts/material-production-sql.cjs --write`.
-- Natureza: somente ADITIVA. Cria 2 enums, 2 tabelas novas (materials, material_assets),
-- índices, FK RESTRICT e CHECKs de prisma/proposals/materials.sql, e importa os 15 materiais
-- do catálogo: 14 PUBLISHED e 1 DRAFT (material-initial-014, sem link Hotmart).
-- NÃO altera, renomeia ou apaga nada existente. NÃO toca users, auth_*, plans,
-- subscriptions, payments ou lessons (impressões digitais conferidas no fim).
--
-- Pré-requisitos: 01 e 02 já aplicados; backup (branch Neon) criado; autorização explícita.
-- Execução (conexão DIRETA, sem -pooler; o arquivo controla a própria transação):
--   psql "<conexão DIRETA>" -v ON_ERROR_STOP=1 -f 04-materials.sql
-- Qualquer erro aborta a transação inteira: nada é aplicado.
-- Reexecução: recusada pela pré-condição (as tabelas já existem). Não usar IF NOT EXISTS:
-- drift deve ser analisado, não mascarado.
-- Depois: rodar 05 (trava operacional) ANTES de definir MATERIALS_PERSISTENCE=enabled.
-- Isolamento REPEATABLE READ: as impressões digitais de antes e depois usam o mesmo snapshot,
-- então escritas concorrentes legítimas (webhook, login) não abortam a migração; uma alteração
-- feita por este próprio script nessas tabelas continua sendo detectada.
-- =====================================================================

SET client_encoding = 'UTF8';
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public;
SELECT pg_advisory_xact_lock(61420320);

-- ---------------------------------------------------------------------
-- Pré-condições
-- ---------------------------------------------------------------------
DO $pre$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY['users', 'plans', 'subscriptions', 'payments', 'auth_accounts', 'auth_sessions', 'auth_verifications', 'lessons']) t
  WHERE to_regclass(format('public.%I', t)) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDITION: tabelas ausentes (aplicar 01/02 antes): %', missing;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role' AND typnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'PRECONDITION: tipo "Role" ausente (01 não aplicado)';
  END IF;
  IF to_regclass('public.materials') IS NOT NULL OR to_regclass('public.material_assets') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDITION: tabelas de materiais já existem';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname IN ('MaterialStatus', 'MaterialAssetStatus') AND typnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'PRECONDITION: enums de materiais já existem';
  END IF;
END
$pre$;

-- Impressões digitais dos dados que esta migração não pode tocar.
CREATE TEMP TABLE _materials_before ON COMMIT DROP AS SELECT
  (SELECT count(*) FROM users) AS users,
  (SELECT md5(coalesce(string_agg(md5(row(id, email, role, "disabledAt", "createdAt")::text), '' ORDER BY id), '')) FROM users) AS fp_users,
  (SELECT count(*) FROM plans) AS plans,
  (SELECT md5(coalesce(string_agg(md5(row(id, name, price, duration, "createdAt")::text), '' ORDER BY id), '')) FROM plans) AS fp_plans,
  (SELECT count(*) FROM subscriptions) AS subscriptions,
  (SELECT md5(coalesce(string_agg(md5(row(id, "userId", "planId", status, "startDate", "endDate", "createdAt")::text), '' ORDER BY id), '')) FROM subscriptions) AS fp_subscriptions,
  (SELECT count(*) FROM payments) AS payments,
  (SELECT md5(coalesce(string_agg(md5(row(id, "mercadopagoId", email, plan, status, amount, "createdAt")::text), '' ORDER BY id), '')) FROM payments) AS fp_payments,
  (SELECT count(*) FROM lessons) AS lessons,
  (SELECT md5(coalesce(string_agg(md5(row(id, status, "updatedAt")::text), '' ORDER BY id), '')) FROM lessons) AS fp_lessons,
  (SELECT count(*) FROM auth_accounts) AS auth_accounts,
  (SELECT md5(coalesce(string_agg(md5(row(id, "userId", "providerId")::text), '' ORDER BY id), '')) FROM auth_accounts) AS fp_auth_accounts;

-- ---------------------------------------------------------------------
-- Estrutura (idêntica a prisma/proposals/materials.sql)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Importação dos 15 materiais do catálogo (ids, títulos, preços, capas,
-- links e ordem preservados; sem link Hotmart => DRAFT).
-- ON CONFLICT DO NOTHING: nunca sobrescreve um registro existente.
-- ---------------------------------------------------------------------
INSERT INTO "materials" ("id", "title", "description", "priceCents", "currency", "coverImage", "checkoutUrl", "isPremium", "displayOrder", "status", "updatedAt") VALUES
  ('material-initial-001', 'Aprendendo Sobre a Felicidade', NULL, 490, 'BRL', '/aprendendofelicidade.webp', 'https://go.hotmart.com/Y104296139M', false, 0, 'PUBLISHED', CURRENT_TIMESTAMP),
  ('material-initial-002', 'Arraiá da Alfabetização', NULL, 990, 'BRL', '/arraiá.webp', 'https://go.hotmart.com/Y104296464A', false, 1, 'PUBLISHED', CURRENT_TIMESTAMP),
  ('material-initial-003', 'Caçadores de Palavras', NULL, 1490, 'BRL', '/caçadoresdepalavras.webp', 'https://go.hotmart.com/P104313409N', true, 2, 'PUBLISHED', CURRENT_TIMESTAMP),
  ('material-initial-004', 'Girassol ☀️ e a Vida', NULL, 990, 'BRL', '/girasol_vida.webp', 'https://go.hotmart.com/B104313490J', true, 3, 'PUBLISHED', CURRENT_TIMESTAMP),
  ('material-initial-005', 'História na Caixa -  As bolinhas que Davam e Tiravam o Poder de João', NULL, 490, 'BRL', '/História.webp', 'https://go.hotmart.com/P104313546Q', false, 4, 'PUBLISHED', CURRENT_TIMESTAMP),
  ('material-initial-006', 'Intrusos - Letra Inicial', NULL, 490, 'BRL', '/intrusos.webp', 'https://go.hotmart.com/P104313546Q', false, 5, 'PUBLISHED', CURRENT_TIMESTAMP),
  ('material-initial-007', 'Jogo da Memória com Alfabeto', NULL, 490, 'BRL', '/jogodamemória.webp', 'https://go.hotmart.com/Q104320776L', false, 6, 'PUBLISHED', CURRENT_TIMESTAMP),
  ('material-initial-008', 'Leitores de Palavras', NULL, 990, 'BRL', '/leitoresdepalavras.webp', 'https://go.hotmart.com/J104322438G', true, 7, 'PUBLISHED', CURRENT_TIMESTAMP),
  ('material-initial-009', 'Letras Iguais', NULL, 490, 'BRL', '/letrasiguais.webp', 'https://go.hotmart.com/H104303497L', false, 8, 'PUBLISHED', CURRENT_TIMESTAMP),
  ('material-initial-010', 'Marmita da Leitura', NULL, 1490, 'BRL', '/marmitadaleitura.webp', 'https://go.hotmart.com/M104322471P', true, 9, 'PUBLISHED', CURRENT_TIMESTAMP),
  ('material-initial-011', 'Mood Kids', NULL, 990, 'BRL', '/moodkids.webp', 'https://go.hotmart.com/U104303566C', true, 10, 'PUBLISHED', CURRENT_TIMESTAMP),
  ('material-initial-012', 'Não Aceitamos Fiado', NULL, 1290, 'BRL', '/não_aceitamos_fiado.webp', 'https://go.hotmart.com/L104322533M', true, 11, 'PUBLISHED', CURRENT_TIMESTAMP),
  ('material-initial-013', 'Pipoca com Rima', NULL, 1290, 'BRL', '/pipocacomrima.webp', 'https://go.hotmart.com/T104322586Y', true, 12, 'PUBLISHED', CURRENT_TIMESTAMP),
  ('material-initial-014', 'Termômetro das Emoções', NULL, 490, 'BRL', '/termometro.webp', '', false, 13, 'DRAFT', CURRENT_TIMESTAMP),
  ('material-initial-015', 'Varal Literário', NULL, 690, 'BRL', '/varalliterário.webp', 'https://go.hotmart.com/K104322633D', false, 14, 'PUBLISHED', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- ---------------------------------------------------------------------
-- Pós-condições
-- ---------------------------------------------------------------------
DO $post$
DECLARE
  b record;
  label constant text := 'POSTCONDITION';
BEGIN
  SELECT * INTO b FROM _materials_before;
  IF (SELECT count(*) FROM users) <> b.users OR (SELECT md5(coalesce(string_agg(md5(row(id, email, role, "disabledAt", "createdAt")::text), '' ORDER BY id), '')) FROM users) <> b.fp_users THEN
    RAISE EXCEPTION 'POSTCONDITION: dados de users alterados';
  END IF;
  IF (SELECT count(*) FROM plans) <> b.plans OR (SELECT md5(coalesce(string_agg(md5(row(id, name, price, duration, "createdAt")::text), '' ORDER BY id), '')) FROM plans) <> b.fp_plans THEN
    RAISE EXCEPTION 'POSTCONDITION: dados de plans alterados';
  END IF;
  IF (SELECT count(*) FROM subscriptions) <> b.subscriptions OR (SELECT md5(coalesce(string_agg(md5(row(id, "userId", "planId", status, "startDate", "endDate", "createdAt")::text), '' ORDER BY id), '')) FROM subscriptions) <> b.fp_subscriptions THEN
    RAISE EXCEPTION 'POSTCONDITION: dados de subscriptions alterados';
  END IF;
  IF (SELECT count(*) FROM payments) <> b.payments OR (SELECT md5(coalesce(string_agg(md5(row(id, "mercadopagoId", email, plan, status, amount, "createdAt")::text), '' ORDER BY id), '')) FROM payments) <> b.fp_payments THEN
    RAISE EXCEPTION 'POSTCONDITION: dados de payments alterados';
  END IF;
  IF (SELECT count(*) FROM lessons) <> b.lessons OR (SELECT md5(coalesce(string_agg(md5(row(id, status, "updatedAt")::text), '' ORDER BY id), '')) FROM lessons) <> b.fp_lessons THEN
    RAISE EXCEPTION 'POSTCONDITION: dados de lessons alterados';
  END IF;
  IF (SELECT count(*) FROM auth_accounts) <> b.auth_accounts OR (SELECT md5(coalesce(string_agg(md5(row(id, "userId", "providerId")::text), '' ORDER BY id), '')) FROM auth_accounts) <> b.fp_auth_accounts THEN
    RAISE EXCEPTION 'POSTCONDITION: dados de auth_accounts alterados';
  END IF;
  IF (SELECT count(*) FROM "materials") <> 15 THEN
    RAISE EXCEPTION 'POSTCONDITION: materials deveria ter 15 linhas';
  END IF;
  IF (SELECT count(*) FROM "materials" WHERE "status" = 'PUBLISHED') <> 14 THEN
    RAISE EXCEPTION 'POSTCONDITION: deveriam existir 14 materiais PUBLISHED';
  END IF;
  IF (SELECT string_agg("id", ',' ORDER BY "id") FROM "materials" WHERE "status" = 'DRAFT') IS DISTINCT FROM 'material-initial-014' THEN
    RAISE EXCEPTION 'POSTCONDITION: somente material-initial-014 deveria estar em DRAFT';
  END IF;
  IF EXISTS (SELECT 1 FROM "material_assets") THEN
    RAISE EXCEPTION 'POSTCONDITION: material_assets deveria estar vazia';
  END IF;
  IF EXISTS (
  (SELECT * FROM (VALUES
    ('material-initial-001', 'Aprendendo Sobre a Felicidade', NULL, 490, 'BRL', '/aprendendofelicidade.webp', 'https://go.hotmart.com/Y104296139M', false, 0, 'PUBLISHED'),
    ('material-initial-002', 'Arraiá da Alfabetização', NULL, 990, 'BRL', '/arraiá.webp', 'https://go.hotmart.com/Y104296464A', false, 1, 'PUBLISHED'),
    ('material-initial-003', 'Caçadores de Palavras', NULL, 1490, 'BRL', '/caçadoresdepalavras.webp', 'https://go.hotmart.com/P104313409N', true, 2, 'PUBLISHED'),
    ('material-initial-004', 'Girassol ☀️ e a Vida', NULL, 990, 'BRL', '/girasol_vida.webp', 'https://go.hotmart.com/B104313490J', true, 3, 'PUBLISHED'),
    ('material-initial-005', 'História na Caixa -  As bolinhas que Davam e Tiravam o Poder de João', NULL, 490, 'BRL', '/História.webp', 'https://go.hotmart.com/P104313546Q', false, 4, 'PUBLISHED'),
    ('material-initial-006', 'Intrusos - Letra Inicial', NULL, 490, 'BRL', '/intrusos.webp', 'https://go.hotmart.com/P104313546Q', false, 5, 'PUBLISHED'),
    ('material-initial-007', 'Jogo da Memória com Alfabeto', NULL, 490, 'BRL', '/jogodamemória.webp', 'https://go.hotmart.com/Q104320776L', false, 6, 'PUBLISHED'),
    ('material-initial-008', 'Leitores de Palavras', NULL, 990, 'BRL', '/leitoresdepalavras.webp', 'https://go.hotmart.com/J104322438G', true, 7, 'PUBLISHED'),
    ('material-initial-009', 'Letras Iguais', NULL, 490, 'BRL', '/letrasiguais.webp', 'https://go.hotmart.com/H104303497L', false, 8, 'PUBLISHED'),
    ('material-initial-010', 'Marmita da Leitura', NULL, 1490, 'BRL', '/marmitadaleitura.webp', 'https://go.hotmart.com/M104322471P', true, 9, 'PUBLISHED'),
    ('material-initial-011', 'Mood Kids', NULL, 990, 'BRL', '/moodkids.webp', 'https://go.hotmart.com/U104303566C', true, 10, 'PUBLISHED'),
    ('material-initial-012', 'Não Aceitamos Fiado', NULL, 1290, 'BRL', '/não_aceitamos_fiado.webp', 'https://go.hotmart.com/L104322533M', true, 11, 'PUBLISHED'),
    ('material-initial-013', 'Pipoca com Rima', NULL, 1290, 'BRL', '/pipocacomrima.webp', 'https://go.hotmart.com/T104322586Y', true, 12, 'PUBLISHED'),
    ('material-initial-014', 'Termômetro das Emoções', NULL, 490, 'BRL', '/termometro.webp', '', false, 13, 'DRAFT'),
    ('material-initial-015', 'Varal Literário', NULL, 690, 'BRL', '/varalliterário.webp', 'https://go.hotmart.com/K104322633D', false, 14, 'PUBLISHED')
  ) AS expected("id", "title", "description", "priceCents", "currency", "coverImage", "checkoutUrl", "isPremium", "displayOrder", "status")
   EXCEPT SELECT "id", "title", "description", "priceCents", "currency", "coverImage", "checkoutUrl", "isPremium", "displayOrder", "status"::text FROM "materials")
  UNION ALL
  (SELECT "id", "title", "description", "priceCents", "currency", "coverImage", "checkoutUrl", "isPremium", "displayOrder", "status"::text FROM "materials"
   EXCEPT SELECT * FROM (VALUES
    ('material-initial-001', 'Aprendendo Sobre a Felicidade', NULL, 490, 'BRL', '/aprendendofelicidade.webp', 'https://go.hotmart.com/Y104296139M', false, 0, 'PUBLISHED'),
    ('material-initial-002', 'Arraiá da Alfabetização', NULL, 990, 'BRL', '/arraiá.webp', 'https://go.hotmart.com/Y104296464A', false, 1, 'PUBLISHED'),
    ('material-initial-003', 'Caçadores de Palavras', NULL, 1490, 'BRL', '/caçadoresdepalavras.webp', 'https://go.hotmart.com/P104313409N', true, 2, 'PUBLISHED'),
    ('material-initial-004', 'Girassol ☀️ e a Vida', NULL, 990, 'BRL', '/girasol_vida.webp', 'https://go.hotmart.com/B104313490J', true, 3, 'PUBLISHED'),
    ('material-initial-005', 'História na Caixa -  As bolinhas que Davam e Tiravam o Poder de João', NULL, 490, 'BRL', '/História.webp', 'https://go.hotmart.com/P104313546Q', false, 4, 'PUBLISHED'),
    ('material-initial-006', 'Intrusos - Letra Inicial', NULL, 490, 'BRL', '/intrusos.webp', 'https://go.hotmart.com/P104313546Q', false, 5, 'PUBLISHED'),
    ('material-initial-007', 'Jogo da Memória com Alfabeto', NULL, 490, 'BRL', '/jogodamemória.webp', 'https://go.hotmart.com/Q104320776L', false, 6, 'PUBLISHED'),
    ('material-initial-008', 'Leitores de Palavras', NULL, 990, 'BRL', '/leitoresdepalavras.webp', 'https://go.hotmart.com/J104322438G', true, 7, 'PUBLISHED'),
    ('material-initial-009', 'Letras Iguais', NULL, 490, 'BRL', '/letrasiguais.webp', 'https://go.hotmart.com/H104303497L', false, 8, 'PUBLISHED'),
    ('material-initial-010', 'Marmita da Leitura', NULL, 1490, 'BRL', '/marmitadaleitura.webp', 'https://go.hotmart.com/M104322471P', true, 9, 'PUBLISHED'),
    ('material-initial-011', 'Mood Kids', NULL, 990, 'BRL', '/moodkids.webp', 'https://go.hotmart.com/U104303566C', true, 10, 'PUBLISHED'),
    ('material-initial-012', 'Não Aceitamos Fiado', NULL, 1290, 'BRL', '/não_aceitamos_fiado.webp', 'https://go.hotmart.com/L104322533M', true, 11, 'PUBLISHED'),
    ('material-initial-013', 'Pipoca com Rima', NULL, 1290, 'BRL', '/pipocacomrima.webp', 'https://go.hotmart.com/T104322586Y', true, 12, 'PUBLISHED'),
    ('material-initial-014', 'Termômetro das Emoções', NULL, 490, 'BRL', '/termometro.webp', '', false, 13, 'DRAFT'),
    ('material-initial-015', 'Varal Literário', NULL, 690, 'BRL', '/varalliterário.webp', 'https://go.hotmart.com/K104322633D', false, 14, 'PUBLISHED')
  ) AS expected("id", "title", "description", "priceCents", "currency", "coverImage", "checkoutUrl", "isPremium", "displayOrder", "status"))
  ) THEN
    RAISE EXCEPTION 'POSTCONDITION: valores importados divergem do catálogo (verificar codificação UTF-8)';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid IN ('public.materials'::regclass, 'public.material_assets'::regclass)
      AND contype IN ('p', 'f', 'c')) <> 10 THEN
    RAISE EXCEPTION 'POSTCONDITION: esperadas 10 restrições (2 PK, 1 FK, 7 CHECK)';
  END IF;
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('materials', 'material_assets')) <> 7 THEN
    RAISE EXCEPTION 'POSTCONDITION: esperados 7 índices';
  END IF;
  IF (SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'MaterialStatus' AND t.typnamespace = 'public'::regnamespace) IS DISTINCT FROM 'DRAFT,PUBLISHED,ARCHIVED'
     OR (SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'MaterialAssetStatus' AND t.typnamespace = 'public'::regnamespace) IS DISTINCT FROM 'PENDING,VALIDATED,REJECTED,ARCHIVED' THEN
    RAISE EXCEPTION '%: enums de materiais divergentes', label;
  END IF;
END
$post$;

COMMIT;
