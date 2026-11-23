-- =====================================================================
-- 92 — REVERSÃO: gerenciamento de usuários (EXIGE AUTORIZAÇÃO)
-- =====================================================================
-- Remove EXCLUSIVAMENTE os objetos criados pelo 06. Só é permitido ANTES de qualquer uso:
-- aborta se existir evento de auditoria, administrador principal ou troca de senha pendente.
-- Depois de qualquer uso, o caminho é backup/PITR numa branch nova; nunca editar estas guardas para forçar.
-- Ordem obrigatória: primeiro voltar a aplicação para a versão anterior (que não lê as colunas novas).
-- Se o 08 existir no banco, reverter o 93 ANTES deste arquivo: o 08 depende do 06 e este script aborta
-- enquanto qualquer objeto do 08 (manual_access_grants, manual_access_events, "ManualAccessAction") existir.
-- Não toca linhas de users, auth_*, plans, subscriptions, payments, lessons ou materiais.
--   psql "<conexão DIRETA>" -v ON_ERROR_STOP=1 -f 92-admin-users-reversao.sql
-- =====================================================================

SET client_encoding = 'UTF8';
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public;

DO $exists$
BEGIN
  IF to_regclass('public.admin_audit_events') IS NULL THEN
    RAISE EXCEPTION 'GUARD: 06 não aplicado — nada a reverter';
  END IF;
END
$exists$;

DO $dependents$
BEGIN
  IF to_regclass('public.manual_access_grants') IS NOT NULL OR to_regclass('public.manual_access_events') IS NOT NULL
     OR to_regtype('public."ManualAccessAction"') IS NOT NULL THEN
    RAISE EXCEPTION 'GUARD: objetos do 08 presentes — reverter o 93 antes do 92';
  END IF;
END
$dependents$;

LOCK TABLE "users", "admin_audit_events" IN ACCESS EXCLUSIVE MODE;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM "admin_audit_events") THEN
    RAISE EXCEPTION 'GUARD: existe auditoria registrada — usar backup/PITR';
  END IF;
  IF EXISTS (SELECT 1 FROM "users" WHERE "isPrincipalAdmin" OR "mustChangePassword") THEN
    RAISE EXCEPTION 'GUARD: existem principais designados ou trocas de senha pendentes — usar backup/PITR';
  END IF;
END
$guard$;

DROP TRIGGER "admin_audit_events_no_truncate" ON "admin_audit_events";
DROP TRIGGER "admin_audit_events_no_update_delete" ON "admin_audit_events";
DROP FUNCTION "admin_audit_events_append_only"();
DROP TABLE "admin_audit_events";
DROP TYPE "AdminAuditAction";
DROP TRIGGER "users_principal_admin_guard" ON "users";
DROP FUNCTION "users_principal_admin_guard"();
ALTER TABLE "users" DROP CONSTRAINT "users_principal_admin_role_check";
ALTER TABLE "users" DROP COLUMN "mustChangePassword", DROP COLUMN "isPrincipalAdmin";

COMMIT;
