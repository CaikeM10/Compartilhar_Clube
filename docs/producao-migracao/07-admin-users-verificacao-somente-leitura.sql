-- =====================================================================
-- 07 — VERIFICAÇÃO (SOMENTE LEITURA): gerenciamento de usuários
-- =====================================================================
-- Rodar após o 06, após cada designação de principal e na homologação. Termina em ROLLBACK e não grava nada.
-- Não mostra senhas, hashes ou tokens. Mostra e-mails apenas dos administradores principais (seção 3).
--   psql "<conexão>" -v ON_ERROR_STOP=1 -f 07-admin-users-verificacao-somente-leitura.sql -o resultados/07-<ambiente>.txt
-- =====================================================================

SET client_encoding = 'UTF8';
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public;

-- 1. Objetos (esperado: todos true)
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'isPrincipalAdmin') AS coluna_principal,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'mustChangePassword') AS coluna_troca_senha,
       to_regclass('public.admin_audit_events') IS NOT NULL AS tabela_auditoria,
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_principal_admin_role_check') AS restricao_principal_admin,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'users_principal_admin_guard' AND NOT tgisinternal) AS gatilho_principais,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'admin_audit_events_no_update_delete' AND NOT tgisinternal) AS gatilho_auditoria,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'admin_audit_events_no_truncate' AND NOT tgisinternal) AS gatilho_auditoria_truncate;

-- 2. Papéis (esperado: principais <= 2; todo principal é ADMIN habilitado com credencial)
SELECT "role"::text AS papel, count(*) AS total, count(*) FILTER (WHERE "isPrincipalAdmin") AS principais,
       count(*) FILTER (WHERE "mustChangePassword") AS troca_senha_pendente, count(*) FILTER (WHERE "disabledAt" IS NOT NULL) AS desativados
FROM "users" GROUP BY 1 ORDER BY 1;

-- 3. Administradores principais (esperado: no máximo 2 linhas, todas com credencial e habilitadas)
SELECT u."id", u."email", u."role"::text AS papel, u."disabledAt" IS NULL AS habilitado,
       EXISTS (SELECT 1 FROM "auth_accounts" a WHERE a."userId" = u."id" AND a."providerId" = 'credential') AS tem_credencial
FROM "users" u WHERE u."isPrincipalAdmin" ORDER BY u."createdAt";

-- 4. Auditoria por ação (contagens apenas)
SELECT "action"::text AS acao, count(*) AS total, max("createdAt") AS ultimo FROM "admin_audit_events" GROUP BY 1 ORDER BY 1;

-- 5. Usuários criados pelo painel sem evento de auditoria (esperado: nenhuma linha)
SELECT u."id" FROM "users" u
WHERE u."mustChangePassword" AND NOT EXISTS (
  SELECT 1 FROM "admin_audit_events" e WHERE e."targetUserId" = u."id" AND e."action" IN ('USER_CREATED', 'OPERATOR_PASSWORD_RESET'));

-- 6. Trava final: falha se houver mais de 2 principais ou principal inválido
DO $check$
BEGIN
  IF (SELECT count(*) FROM "users" WHERE "isPrincipalAdmin") > 2 THEN RAISE EXCEPTION 'CHECK: mais de 2 administradores principais'; END IF;
  IF EXISTS (SELECT 1 FROM "users" u WHERE u."isPrincipalAdmin" AND (u."role" <> 'ADMIN' OR u."disabledAt" IS NOT NULL OR NOT EXISTS (
       SELECT 1 FROM "auth_accounts" a WHERE a."userId" = u."id" AND a."providerId" = 'credential'))) THEN
    RAISE EXCEPTION 'CHECK: administrador principal sem papel ADMIN, desativado ou sem credencial';
  END IF;
END
$check$;

ROLLBACK;
