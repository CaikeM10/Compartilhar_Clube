-- =====================================================================
-- 09 — VERIFICAÇÃO (SOMENTE LEITURA): liberação manual de acesso
-- =====================================================================
-- Rodar após o 08 e na homologação. Termina em ROLLBACK e não grava nada.
-- Não mostra e-mails, senhas, hashes ou tokens: apenas contagens e ids.
--   psql "<conexão>" -v ON_ERROR_STOP=1 -f 09-manual-access-verificacao-somente-leitura.sql -o resultados/09-<ambiente>.txt
-- =====================================================================

SET client_encoding = 'UTF8';
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public;

-- 1. Objetos (esperado: todos true)
SELECT to_regclass('public.manual_access_grants') IS NOT NULL AS tabela_concessoes,
       to_regclass('public.manual_access_events') IS NOT NULL AS tabela_auditoria,
       to_regtype('public."ManualAccessAction"') IS NOT NULL AS tipo_acao,
       EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'manual_access_grants_userId_key') AS indice_unico_aluno,
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manual_access_grants_period_check') AS restricao_periodo,
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manual_access_grants_revocation_check') AS restricao_revogacao,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'manual_access_grants_guard' AND NOT tgisinternal) AS gatilho_aluno_admin,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'manual_access_grants_no_delete' AND NOT tgisinternal) AS gatilho_sem_exclusao,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'manual_access_events_no_update_delete' AND NOT tgisinternal) AS gatilho_auditoria,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'manual_access_events_no_truncate' AND NOT tgisinternal) AS gatilho_auditoria_truncate;

-- 2. Situação das concessões (contagens apenas)
SELECT CASE WHEN g."revokedAt" IS NOT NULL THEN 'revogada'
            WHEN g."endsAt" <= now() AT TIME ZONE 'UTC' THEN 'expirada'
            WHEN g."startsAt" > now() AT TIME ZONE 'UTC' THEN 'agendada'
            ELSE 'ativa' END AS situacao,
       count(*) AS total
FROM "manual_access_grants" g GROUP BY 1 ORDER BY 1;

-- 3. Auditoria por ação (contagens apenas)
SELECT "action"::text AS acao, count(*) AS total, max("createdAt") AS ultimo FROM "manual_access_events" GROUP BY 1 ORDER BY 1;

-- 4. Concessões sem evento GRANTED (esperado: nenhuma linha)
SELECT g."id" FROM "manual_access_grants" g
WHERE NOT EXISTS (SELECT 1 FROM "manual_access_events" e WHERE e."grantId" = g."id" AND e."action" = 'GRANTED');

-- 5. Concessões vigentes de contas que não são aluno habilitado (esperado: nenhuma linha; o acesso seria indevido)
SELECT g."id", u."role"::text AS papel, u."disabledAt" IS NOT NULL AS desativado
FROM "manual_access_grants" g JOIN "users" u ON u."id" = g."userId"
WHERE g."revokedAt" IS NULL AND g."endsAt" > now() AT TIME ZONE 'UTC' AND (u."role" <> 'STUDENT' OR u."disabledAt" IS NOT NULL);

-- 6. Trava final: nenhuma concessão com período inválido nem revogação incompleta
DO $check$
BEGIN
  IF EXISTS (SELECT 1 FROM "manual_access_grants" WHERE "endsAt" <= "startsAt"
             OR ("revokedAt" IS NULL) <> ("revokedById" IS NULL)) THEN
    RAISE EXCEPTION 'CHECK: concessão com período inválido ou revogação incompleta';
  END IF;
END
$check$;

ROLLBACK;
