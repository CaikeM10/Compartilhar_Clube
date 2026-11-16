-- =====================================================================
-- 90 — REVERSÃO DE EMERGÊNCIA (NÃO É O CAMINHO PADRÃO — EXIGE AUTORIZAÇÃO)
-- =====================================================================
-- Preferência de recuperação (ver README.md, seção "Recuperação"):
--   1) Manter o schema (é aditivo; o código antigo continua compatível) e
--      fazer rollback apenas do deploy na Vercel.
--   2) Restaurar o snapshot/PITR do Neon numa branch nova e comparar.
--   3) Só então, e só se nenhum dado de autenticação tiver sido gravado,
--      este script remove EXCLUSIVAMENTE os objetos criados por 01 e 02.
--
-- Ele NUNCA remove tabelas/colunas legadas (users, plans, subscriptions,
-- payments, users.id/name/email/password/createdAt) e aborta se houver
-- qualquer conta, sessão, verificação, aula, admin ou valor não padrão.
-- =====================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public;

DO $guard$
BEGIN
  IF to_regclass('public.auth_accounts') IS NULL OR to_regclass('public.auth_sessions') IS NULL
     OR to_regclass('public.auth_verifications') IS NULL THEN
    RAISE EXCEPTION 'GUARD: estado inesperado; tabelas de auth ausentes — analisar manualmente';
  END IF;
  IF EXISTS (SELECT 1 FROM auth_accounts) OR EXISTS (SELECT 1 FROM auth_sessions)
     OR EXISTS (SELECT 1 FROM auth_verifications) THEN
    RAISE EXCEPTION 'GUARD: já existem contas/sessões/verificações; reversão destruiria dados — usar snapshot';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE role <> 'STUDENT' OR "emailVerified" OR "disabledAt" IS NOT NULL OR image IS NOT NULL) THEN
    RAISE EXCEPTION 'GUARD: users já tem valores de autenticação gravados — usar snapshot';
  END IF;
  IF to_regclass('public.lessons') IS NOT NULL AND EXISTS (SELECT 1 FROM lessons) THEN
    RAISE EXCEPTION 'GUARD: lessons contém aulas — usar snapshot';
  END IF;
END
$guard$;

-- Objetos criados por 02 (se existirem e estiverem vazios)
DROP TABLE IF EXISTS "lessons";
DROP TYPE IF EXISTS "LessonStatus";

-- Objetos criados por 01
DROP TABLE "auth_sessions";
DROP TABLE "auth_accounts";
DROP TABLE "auth_verifications";
ALTER TABLE "users" DROP COLUMN "updatedAt",
                    DROP COLUMN "role",
                    DROP COLUMN "image",
                    DROP COLUMN "emailVerified",
                    DROP COLUMN "disabledAt";
DROP TYPE "Role";

COMMIT;
