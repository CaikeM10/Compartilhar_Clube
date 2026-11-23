-- =====================================================================
-- 91 — REVERSÃO DE EMERGÊNCIA: materiais (EXIGE AUTORIZAÇÃO)
-- =====================================================================
-- GERADO por scripts/material-production-sql.cjs a partir de lib/materials/catalog.json.
-- Não editar à mão: altere o gerador e rode `node scripts/material-production-sql.cjs --write`.
-- Remove EXCLUSIVAMENTE os objetos criados pelo 04 (materials, material_assets e seus enums).
-- Ordem obrigatória antes de rodar:
--   1) remover MATERIALS_PERSISTENCE da Vercel e fazer redeploy (o site volta ao catálogo estático);
--   2) confirmar que nenhuma instância ainda usa as tabelas.
-- Aborta se existir qualquer arquivo em material_assets ou se os materiais não forem EXATAMENTE
-- os 15 importados pelo 04, sem edições. Havendo edições do admin, o caminho é backup/PITR
-- numa branch nova — nunca editar estas guardas para forçar a execução.
-- Não toca users, auth_*, plans, subscriptions, payments ou lessons.
--   psql "<conexão DIRETA>" -v ON_ERROR_STOP=1 -f 91-materials-reversao.sql
-- =====================================================================

SET client_encoding = 'UTF8';
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public;
SELECT pg_advisory_xact_lock(61420320);

DO $exists$
BEGIN
  IF to_regclass('public.materials') IS NULL OR to_regclass('public.material_assets') IS NULL THEN
    RAISE EXCEPTION 'GUARD: tabelas de materiais ausentes — estado inesperado, analisar manualmente';
  END IF;
END
$exists$;

-- Impede escritas concorrentes entre a guarda e a remoção.
LOCK TABLE "materials", "material_assets" IN ACCESS EXCLUSIVE MODE;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM "material_assets") THEN
    RAISE EXCEPTION 'GUARD: existem arquivos em material_assets — usar backup/PITR';
  END IF;
  IF (SELECT count(*) FROM "materials") <> 15 OR EXISTS (
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
    RAISE EXCEPTION 'GUARD: materiais editados ou adicionados após o 04 — usar backup/PITR';
  END IF;
END
$guard$;

DROP TABLE "material_assets";
DROP TABLE "materials";
DROP TYPE "MaterialAssetStatus";
DROP TYPE "MaterialStatus";

DO $post$
BEGIN
  IF to_regclass('public.materials') IS NOT NULL OR to_regclass('public.material_assets') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_type WHERE typname IN ('MaterialStatus', 'MaterialAssetStatus') AND typnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'POSTCONDITION: objetos de materiais ainda presentes';
  END IF;
END
$post$;

COMMIT;
