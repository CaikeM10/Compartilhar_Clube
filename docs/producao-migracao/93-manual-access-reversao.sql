-- =====================================================================
-- 93 — REVERSÃO: liberação manual de acesso (EXIGE AUTORIZAÇÃO)
-- =====================================================================
-- Remove EXCLUSIVAMENTE os objetos criados pelo 08. Só é permitido ANTES de qualquer uso:
-- aborta se existir qualquer concessão ou evento de auditoria.
-- Depois de qualquer uso, o caminho é backup/PITR numa branch nova; nunca editar estas guardas para forçar.
-- Ordem obrigatória: primeiro voltar a aplicação para a versão anterior (que não lê as tabelas novas).
-- Ordem de reversão: 93 antes de 92 (o 92 aborta enquanto os objetos do 08 existirem).
-- Não toca linhas de users, auth_*, plans, subscriptions, payments, admin_audit_events, lessons ou materiais.
--   psql "<conexão DIRETA>" -v ON_ERROR_STOP=1 -f 93-manual-access-reversao.sql
-- =====================================================================

SET client_encoding = 'UTF8';
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public;

DO $exists$
BEGIN
  IF to_regclass('public.manual_access_grants') IS NULL OR to_regclass('public.manual_access_events') IS NULL THEN
    RAISE EXCEPTION 'GUARD: 08 não aplicado (ou parcial) — nada a reverter automaticamente';
  END IF;
END
$exists$;

LOCK TABLE "manual_access_grants", "manual_access_events" IN ACCESS EXCLUSIVE MODE;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM "manual_access_grants") OR EXISTS (SELECT 1 FROM "manual_access_events") THEN
    RAISE EXCEPTION 'GUARD: existem concessões ou auditoria registradas — usar backup/PITR';
  END IF;
END
$guard$;

DROP TRIGGER "manual_access_events_no_truncate" ON "manual_access_events";
DROP TRIGGER "manual_access_events_no_update_delete" ON "manual_access_events";
DROP TRIGGER "manual_access_grants_no_truncate" ON "manual_access_grants";
DROP TRIGGER "manual_access_grants_no_delete" ON "manual_access_grants";
DROP TRIGGER "manual_access_grants_guard" ON "manual_access_grants";
DROP FUNCTION "manual_access_no_delete"();
DROP FUNCTION "manual_access_grants_guard"();
DROP TABLE "manual_access_events";
DROP TABLE "manual_access_grants";
DROP TYPE "ManualAccessAction";

COMMIT;
