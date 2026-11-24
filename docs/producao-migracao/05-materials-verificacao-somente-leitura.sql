-- =====================================================================
-- 05 — TRAVA OPERACIONAL: verificação de materiais (SOMENTE LEITURA)
-- =====================================================================
-- GERADO por scripts/material-production-sql.cjs a partir de lib/materials/catalog.json.
-- Não editar à mão: altere o gerador e rode `node scripts/material-production-sql.cjs --write`.
-- Rodar logo após o 04 e ANTES de definir MATERIALS_PERSISTENCE=enabled em qualquer ambiente.
-- Termina em ROLLBACK e não grava nada. Se o bloco final levantar exceção (psql com
-- ON_ERROR_STOP sai com erro), NÃO ligar a persistência: a vitrine ficaria incompleta.
-- Esperado: 15 materiais, 14 PUBLISHED, 1 DRAFT (material-initial-014),
-- seção 3 sem linhas, material_assets vazia.
-- Atenção: depois que o admin editar materiais, a seção 3 passa a mostrar as edições.
-- Este arquivo serve como trava da ativação, não como auditoria permanente.
--   psql "<conexão>" -v ON_ERROR_STOP=1 -f 05-materials-verificacao-somente-leitura.sql -o resultados/05-<ambiente>.txt
-- =====================================================================

SET client_encoding = 'UTF8';
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public;

-- 1. Objetos de materiais
SELECT to_regclass('public.materials') IS NOT NULL AS materials_existe,
       to_regclass('public.material_assets') IS NOT NULL AS material_assets_existe;

-- 2. Contagem por status (esperado: PUBLISHED 14, DRAFT 1)
SELECT "status"::text AS status, count(*) AS total FROM "materials" GROUP BY 1 ORDER BY 1;

-- 3a. No catálogo, mas ausente ou diferente no banco (esperado: nenhuma linha)
SELECT 'catalogo' AS origem, * FROM (
  SELECT * FROM (VALUES
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
   EXCEPT SELECT "id", "title", "description", "priceCents", "currency", "coverImage", "checkoutUrl", "isPremium", "displayOrder", "status"::text FROM "materials"
) AS divergencias ORDER BY "id";

-- 3b. No banco, mas ausente ou diferente no catálogo (esperado: nenhuma linha)
SELECT 'banco' AS origem, * FROM (
  SELECT "id", "title", "description", "priceCents", "currency", "coverImage", "checkoutUrl", "isPremium", "displayOrder", "status"::text FROM "materials"
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
  ) AS expected("id", "title", "description", "priceCents", "currency", "coverImage", "checkoutUrl", "isPremium", "displayOrder", "status")
) AS divergencias ORDER BY "id";

-- 4. Arquivos privados (esperado: 0 antes de existir armazenamento)
SELECT count(*) AS material_assets FROM "material_assets";

-- 5. Trava: qualquer divergência interrompe com erro
DO $gate$
DECLARE
  label constant text := 'TRAVA';
BEGIN
  IF (SELECT count(*) FROM "materials") <> 15
     OR (SELECT count(*) FROM "materials" WHERE "status" = 'PUBLISHED') <> 14 THEN
    RAISE EXCEPTION 'TRAVA: contagens de materiais divergentes — NÃO ligar MATERIALS_PERSISTENCE';
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
    RAISE EXCEPTION 'TRAVA: materiais divergem do catálogo — NÃO ligar MATERIALS_PERSISTENCE';
  END IF;
  IF (SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'MaterialStatus' AND t.typnamespace = 'public'::regnamespace) IS DISTINCT FROM 'DRAFT,PUBLISHED,ARCHIVED'
     OR (SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'MaterialAssetStatus' AND t.typnamespace = 'public'::regnamespace) IS DISTINCT FROM 'PENDING,VALIDATED,REJECTED,ARCHIVED' THEN
    RAISE EXCEPTION '%: enums de materiais divergentes', label;
  END IF;
END
$gate$;

ROLLBACK;
