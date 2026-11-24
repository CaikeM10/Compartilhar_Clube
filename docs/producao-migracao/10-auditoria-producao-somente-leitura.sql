-- =====================================================================
-- 10 — AUDITORIA DE PRODUÇÃO (SOMENTE LEITURA): antes e depois de 04, 06 e 08
-- =====================================================================
-- Rodar ANTES do 04 (linha de base) e de novo depois de CADA etapa (04/05, 06/07, 08/09) e após o deploy.
-- Reutilizável: a trava final só falha por problema de integridade/compatibilidade ou bloco PARCIAL;
-- a presença dos objetos novos é reportada (seção 3/4), não tratada como erro.
-- Transação READ ONLY terminada em ROLLBACK: qualquer escrita seria recusada pelo próprio PostgreSQL.
-- Não mostra e-mails, nomes, senhas, hashes, tokens nem ids: apenas estrutura, contagens, booleanos e
-- impressões digitais (md5 agregado, não reversível).
--   psql "<conexão DIRETA>" -v ON_ERROR_STOP=1 -f 10-auditoria-producao-somente-leitura.sql -o resultados/10-producao-<AAAAMMDD-HHMM>-<etapa>.txt
-- No Neon SQL Editor: colar o arquivo inteiro e executar; conferir o resultado de cada SELECT.
-- =====================================================================

SET client_encoding = 'UTF8';
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '2s';
SET LOCAL search_path = public;

-- 1. Contexto (esperado: banco neondb, réplica false, somente_leitura on, UTF8, versão >= 110000)
SELECT current_database() AS banco, current_schema() AS schema, current_user AS usuario_sql,
       current_setting('server_version') AS versao, current_setting('server_version_num')::int AS versao_num,
       pg_is_in_recovery() AS replica, current_setting('transaction_read_only') AS somente_leitura,
       current_setting('server_encoding') AS codificacao, current_setting('TimeZone') AS fuso,
       now() AT TIME ZONE 'UTC' AS agora_utc;

-- 1b. Pré-checagem estrutural: as seções seguintes consultam as 8 tabelas e estas colunas. Se faltar alguma,
--     para AQUI com um diagnóstico claro (em vez de um erro "relation/column does not exist" no meio do relatório).
DO $estrutura$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY['users', 'plans', 'subscriptions', 'payments', 'auth_accounts', 'auth_sessions', 'auth_verifications', 'lessons']) t
  WHERE to_regclass(format('public.%I', t)) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'AUDITORIA: estrutura incompatível: tabelas ausentes: %', missing;
  END IF;

  SELECT string_agg(e.tabela || '.' || e.coluna, ', ') INTO missing
  FROM (VALUES
    ('users', 'id'), ('users', 'name'), ('users', 'email'), ('users', 'password'), ('users', 'createdAt'), ('users', 'emailVerified'),
    ('users', 'image'), ('users', 'role'), ('users', 'disabledAt'), ('users', 'updatedAt'),
    ('auth_accounts', 'id'), ('auth_accounts', 'accountId'), ('auth_accounts', 'providerId'), ('auth_accounts', 'userId'),
    ('auth_accounts', 'password'), ('auth_accounts', 'accessToken'), ('auth_accounts', 'refreshToken'), ('auth_accounts', 'idToken'),
    ('auth_accounts', 'accessTokenExpiresAt'), ('auth_accounts', 'refreshTokenExpiresAt'), ('auth_accounts', 'scope'),
    ('auth_accounts', 'createdAt'), ('auth_accounts', 'updatedAt'),
    ('auth_sessions', 'id'), ('auth_sessions', 'token'), ('auth_sessions', 'userId'), ('auth_sessions', 'expiresAt'),
    ('auth_sessions', 'ipAddress'), ('auth_sessions', 'userAgent'), ('auth_sessions', 'createdAt'), ('auth_sessions', 'updatedAt'),
    ('auth_verifications', 'id'), ('auth_verifications', 'identifier'), ('auth_verifications', 'value'), ('auth_verifications', 'expiresAt'),
    ('auth_verifications', 'createdAt'), ('auth_verifications', 'updatedAt'),
    ('plans', 'id'), ('plans', 'name'), ('plans', 'price'), ('plans', 'duration'), ('plans', 'createdAt'),
    ('subscriptions', 'id'), ('subscriptions', 'userId'), ('subscriptions', 'planId'), ('subscriptions', 'status'),
    ('subscriptions', 'startDate'), ('subscriptions', 'endDate'), ('subscriptions', 'createdAt'),
    ('payments', 'id'), ('payments', 'mercadopagoId'), ('payments', 'email'), ('payments', 'plan'), ('payments', 'status'),
    ('payments', 'amount'), ('payments', 'createdAt'),
    ('lessons', 'id'), ('lessons', 'title'), ('lessons', 'description'), ('lessons', 'videoUrl'), ('lessons', 'durationMinutes'),
    ('lessons', 'position'), ('lessons', 'status'), ('lessons', 'createdAt'), ('lessons', 'updatedAt')
  ) AS e(tabela, coluna)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = e.tabela AND c.column_name = e.coluna);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'AUDITORIA: estrutura incompatível: colunas ausentes: %', missing;
  END IF;
END
$estrutura$;

-- 2. Todas as tabelas do schema public (esperado antes do 04: exatamente as 8 de 01/02)
SELECT c.relname AS tabela, pg_get_userbyid(c.relowner) AS dono,
       pg_has_role(current_user, c.relowner, 'MEMBER') AS posso_alterar, c.reltuples::bigint AS estimativa_linhas
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
ORDER BY 1;

-- 3. Objetos por bloco (antes do 04: 01/02 presentes; 04/06/08 ausentes)
SELECT o.bloco, o.tipo, o.nome,
       CASE o.tipo
         WHEN 'tabela' THEN to_regclass(format('public.%I', o.nome)) IS NOT NULL
         WHEN 'tipo' THEN to_regtype(format('public.%I', o.nome)) IS NOT NULL
         WHEN 'coluna users' THEN EXISTS (SELECT 1 FROM information_schema.columns
                                          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = o.nome)
         WHEN 'função' THEN to_regprocedure(format('public.%I()', o.nome)) IS NOT NULL
         WHEN 'gatilho' THEN EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                                     WHERE c.relnamespace = 'public'::regnamespace AND t.tgname = o.nome AND NOT t.tgisinternal)
         WHEN 'restrição' THEN EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conname = o.nome)
       END AS existe
FROM (VALUES
  ('01', 'tabela', 'users'), ('01', 'tabela', 'plans'), ('01', 'tabela', 'subscriptions'), ('01', 'tabela', 'payments'),
  ('01', 'tabela', 'auth_accounts'), ('01', 'tabela', 'auth_sessions'), ('01', 'tabela', 'auth_verifications'),
  ('01', 'tipo', 'Role'), ('02', 'tabela', 'lessons'), ('02', 'tipo', 'LessonStatus'),
  ('04', 'tabela', 'materials'), ('04', 'tabela', 'material_assets'),
  ('04', 'tipo', 'MaterialStatus'), ('04', 'tipo', 'MaterialAssetStatus'),
  ('06', 'coluna users', 'isPrincipalAdmin'), ('06', 'coluna users', 'mustChangePassword'),
  ('06', 'restrição', 'users_principal_admin_role_check'),
  ('06', 'função', 'users_principal_admin_guard'), ('06', 'gatilho', 'users_principal_admin_guard'),
  ('06', 'tipo', 'AdminAuditAction'), ('06', 'tabela', 'admin_audit_events'),
  ('06', 'função', 'admin_audit_events_append_only'),
  ('06', 'gatilho', 'admin_audit_events_no_update_delete'), ('06', 'gatilho', 'admin_audit_events_no_truncate'),
  ('08', 'tipo', 'ManualAccessAction'), ('08', 'tabela', 'manual_access_grants'), ('08', 'tabela', 'manual_access_events'),
  ('08', 'função', 'manual_access_grants_guard'), ('08', 'função', 'manual_access_no_delete'),
  ('08', 'gatilho', 'manual_access_grants_guard'), ('08', 'gatilho', 'manual_access_grants_no_delete'),
  ('08', 'gatilho', 'manual_access_grants_no_truncate'), ('08', 'gatilho', 'manual_access_events_no_update_delete'),
  ('08', 'gatilho', 'manual_access_events_no_truncate')
) AS o(bloco, tipo, nome)
ORDER BY o.bloco, o.tipo, o.nome;

-- 4. Situação de cada bloco (ausente | completo | PARCIAL). PARCIAL sempre bloqueia (trava final).
WITH b AS (
  SELECT
    (to_regclass('public.materials') IS NOT NULL)::int + (to_regclass('public.material_assets') IS NOT NULL)::int
      + (to_regtype('public."MaterialStatus"') IS NOT NULL)::int + (to_regtype('public."MaterialAssetStatus"') IS NOT NULL)::int AS b04,
    (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'
       AND column_name IN ('isPrincipalAdmin', 'mustChangePassword'))
      + (to_regclass('public.admin_audit_events') IS NOT NULL)::int + (to_regtype('public."AdminAuditAction"') IS NOT NULL)::int
      + (to_regprocedure('public.users_principal_admin_guard()') IS NOT NULL)::int
      + (to_regprocedure('public.admin_audit_events_append_only()') IS NOT NULL)::int AS b06,
    (to_regclass('public.manual_access_grants') IS NOT NULL)::int + (to_regclass('public.manual_access_events') IS NOT NULL)::int
      + (to_regtype('public."ManualAccessAction"') IS NOT NULL)::int
      + (to_regprocedure('public.manual_access_grants_guard()') IS NOT NULL)::int
      + (to_regprocedure('public.manual_access_no_delete()') IS NOT NULL)::int AS b08
)
SELECT bloco, CASE presentes WHEN 0 THEN 'ausente' WHEN total THEN 'completo' ELSE 'PARCIAL' END AS situacao, presentes, total
FROM b, LATERAL (VALUES ('04', b04, 4), ('06', b06, 6), ('08', b08, 5)) AS v(bloco, presentes, total)
ORDER BY bloco;

-- 5. Nomes que 04/06/08 vão criar e que já estão ocupados por OUTRO objeto (esperado antes: nenhuma linha).
--    As pré-condições checam só tabelas/tipos; uma colisão de índice abortaria a transação no meio (falha segura).
--    Qualquer linha aqui também faz a trava final (seção 18) falhar.
SELECT n.nome, c.relkind AS tipo_relacao
FROM (VALUES ('materials_pkey'), ('material_assets_pkey'), ('materials_status_displayOrder_idx'),
             ('material_assets_storageKey_key'), ('material_assets_materialId_status_idx'),
             ('material_assets_materialId_version_key'), ('material_assets_one_validated'),
             ('admin_audit_events_pkey'), ('admin_audit_events_targetUserId_createdAt_idx'),
             ('admin_audit_events_actorId_createdAt_idx'), ('manual_access_grants_pkey'), ('manual_access_grants_userId_key'),
             ('manual_access_grants_grantedById_idx'), ('manual_access_grants_revokedById_idx'), ('manual_access_events_pkey'),
             ('manual_access_events_grantId_createdAt_idx'), ('manual_access_events_targetUserId_createdAt_idx'),
             ('manual_access_events_actorId_createdAt_idx')) AS n(nome)
JOIN pg_class c ON c.relname = n.nome AND c.relnamespace = 'public'::regnamespace
WHERE to_regclass('public.materials') IS NULL AND n.nome LIKE 'material%'
   OR to_regclass('public.admin_audit_events') IS NULL AND n.nome LIKE 'admin_audit%'
   OR to_regclass('public.manual_access_grants') IS NULL AND n.nome LIKE 'manual_access%';

-- 6. Compatibilidade de colunas: 8 tabelas existentes x prisma/schema.prisma (esperado: tudo 'ok';
--    depois do 06, isPrincipalAdmin/mustChangePassword aparecem como 'extra (tolerado)', pois têm default).
WITH esperado(tabela, coluna, tipo, nulo) AS (VALUES
  ('users', 'id', 'text', 'NO'), ('users', 'name', 'text', 'YES'), ('users', 'email', 'text', 'NO'),
  ('users', 'password', 'text', 'YES'), ('users', 'createdAt', 'timestamp', 'NO'), ('users', 'emailVerified', 'bool', 'NO'),
  ('users', 'image', 'text', 'YES'), ('users', 'role', 'Role', 'NO'), ('users', 'disabledAt', 'timestamp', 'YES'),
  ('users', 'updatedAt', 'timestamp', 'NO'),
  ('auth_accounts', 'id', 'text', 'NO'), ('auth_accounts', 'accountId', 'text', 'NO'), ('auth_accounts', 'providerId', 'text', 'NO'),
  ('auth_accounts', 'userId', 'text', 'NO'), ('auth_accounts', 'password', 'text', 'YES'), ('auth_accounts', 'accessToken', 'text', 'YES'),
  ('auth_accounts', 'refreshToken', 'text', 'YES'), ('auth_accounts', 'idToken', 'text', 'YES'),
  ('auth_accounts', 'accessTokenExpiresAt', 'timestamp', 'YES'), ('auth_accounts', 'refreshTokenExpiresAt', 'timestamp', 'YES'),
  ('auth_accounts', 'scope', 'text', 'YES'), ('auth_accounts', 'createdAt', 'timestamp', 'NO'), ('auth_accounts', 'updatedAt', 'timestamp', 'NO'),
  ('auth_sessions', 'id', 'text', 'NO'), ('auth_sessions', 'token', 'text', 'NO'), ('auth_sessions', 'userId', 'text', 'NO'),
  ('auth_sessions', 'expiresAt', 'timestamp', 'NO'), ('auth_sessions', 'ipAddress', 'text', 'YES'), ('auth_sessions', 'userAgent', 'text', 'YES'),
  ('auth_sessions', 'createdAt', 'timestamp', 'NO'), ('auth_sessions', 'updatedAt', 'timestamp', 'NO'),
  ('auth_verifications', 'id', 'text', 'NO'), ('auth_verifications', 'identifier', 'text', 'NO'), ('auth_verifications', 'value', 'text', 'NO'),
  ('auth_verifications', 'expiresAt', 'timestamp', 'NO'), ('auth_verifications', 'createdAt', 'timestamp', 'NO'),
  ('auth_verifications', 'updatedAt', 'timestamp', 'NO'),
  ('plans', 'id', 'text', 'NO'), ('plans', 'name', 'text', 'NO'), ('plans', 'price', 'int4', 'NO'), ('plans', 'duration', 'int4', 'NO'),
  ('plans', 'createdAt', 'timestamp', 'NO'),
  ('subscriptions', 'id', 'text', 'NO'), ('subscriptions', 'userId', 'text', 'NO'), ('subscriptions', 'planId', 'text', 'NO'),
  ('subscriptions', 'status', 'text', 'NO'), ('subscriptions', 'startDate', 'timestamp', 'NO'), ('subscriptions', 'endDate', 'timestamp', 'NO'),
  ('subscriptions', 'createdAt', 'timestamp', 'NO'),
  ('payments', 'id', 'text', 'NO'), ('payments', 'mercadopagoId', 'text', 'NO'), ('payments', 'email', 'text', 'NO'),
  ('payments', 'plan', 'text', 'NO'), ('payments', 'status', 'text', 'NO'), ('payments', 'amount', 'int4', 'NO'),
  ('payments', 'createdAt', 'timestamp', 'NO'),
  ('lessons', 'id', 'text', 'NO'), ('lessons', 'title', 'text', 'NO'), ('lessons', 'description', 'text', 'NO'),
  ('lessons', 'videoUrl', 'text', 'NO'), ('lessons', 'durationMinutes', 'int4', 'NO'), ('lessons', 'position', 'int4', 'NO'),
  ('lessons', 'status', 'LessonStatus', 'NO'), ('lessons', 'createdAt', 'timestamp', 'NO'), ('lessons', 'updatedAt', 'timestamp', 'NO')
), real AS (
  SELECT table_name::text AS tabela, column_name::text AS coluna, udt_name::text AS tipo, is_nullable::text AS nulo,
         column_default IS NOT NULL AS tem_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name IN ('users', 'auth_accounts', 'auth_sessions', 'auth_verifications',
                                                   'plans', 'subscriptions', 'payments', 'lessons')
)
SELECT coalesce(e.tabela, r.tabela) AS tabela, coalesce(e.coluna, r.coluna) AS coluna,
       e.tipo AS tipo_esperado, r.tipo AS tipo_real, e.nulo AS nulo_esperado, r.nulo AS nulo_real, r.tem_default,
       CASE WHEN r.coluna IS NULL THEN 'FALTANDO (bloqueia)'
            WHEN e.coluna IS NULL AND r.nulo = 'NO' AND NOT r.tem_default THEN 'EXTRA NOT NULL SEM DEFAULT (bloqueia inserts)'
            WHEN e.coluna IS NULL THEN 'extra (tolerado)'
            WHEN e.tipo <> r.tipo THEN 'TIPO DIVERGENTE'
            WHEN e.nulo <> r.nulo THEN 'NULIDADE DIVERGENTE'
            ELSE 'ok' END AS situacao
FROM esperado e FULL JOIN real r ON r.tabela = e.tabela AND r.coluna = e.coluna
ORDER BY (CASE WHEN r.coluna IS NOT NULL AND e.coluna IS NOT NULL AND e.tipo = r.tipo AND e.nulo = r.nulo THEN 1 ELSE 0 END), 1, 2;

-- 7. Valores dos enums (esperado: Role {ADMIN,STUDENT}; LessonStatus {DRAFT,PUBLISHED,ARCHIVED}; depois, os enums novos)
SELECT t.typname AS enum, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS valores
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typnamespace = 'public'::regnamespace
GROUP BY t.typname ORDER BY 1;

-- 8. Restrições das 8 tabelas (conferir: PK em todas; FKs auth_accounts/auth_sessions -> users RESTRICT;
--    subscriptions -> users e plans; UNIQUE users.email, auth_sessions.token, payments.mercadopagoId, plans.name,
--    auth_accounts(providerId, accountId); CHECKs de lessons)
SELECT con.conrelid::regclass AS tabela, con.contype AS tipo, con.conname AS nome, pg_get_constraintdef(con.oid) AS definicao
FROM pg_constraint con
WHERE con.connamespace = 'public'::regnamespace
  AND con.conrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace
                       AND relname IN ('users', 'auth_accounts', 'auth_sessions', 'auth_verifications', 'plans', 'subscriptions', 'payments', 'lessons'))
ORDER BY 1, 2, 3;

SELECT tablename AS tabela, indexname AS indice, indexdef AS definicao
FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('users', 'auth_accounts', 'auth_sessions', 'auth_verifications', 'plans', 'subscriptions', 'payments', 'lessons')
ORDER BY 1, 2;

-- 9. Gatilhos e regras em tabelas existentes (esperado antes do 06: nenhuma linha; depois: só users_principal_admin_guard)
SELECT c.relname AS tabela, t.tgname AS gatilho, t.tgenabled AS habilitado
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal
  AND c.relname IN ('users', 'auth_accounts', 'auth_sessions', 'auth_verifications', 'plans', 'subscriptions', 'payments', 'lessons')
UNION ALL
SELECT tablename, 'REGRA: ' || rulename, NULL FROM pg_rules WHERE schemaname = 'public'
ORDER BY 1, 2;

-- 10. Contagens (anotar: devem ser iguais antes e depois de cada migração, salvo uso legítimo do site)
SELECT 'users' AS tabela, count(*) AS linhas FROM users
UNION ALL SELECT 'auth_accounts', count(*) FROM auth_accounts
UNION ALL SELECT 'auth_sessions', count(*) FROM auth_sessions
UNION ALL SELECT 'auth_verifications', count(*) FROM auth_verifications
UNION ALL SELECT 'plans', count(*) FROM plans
UNION ALL SELECT 'subscriptions', count(*) FROM subscriptions
UNION ALL SELECT 'payments', count(*) FROM payments
UNION ALL SELECT 'lessons', count(*) FROM lessons;

-- 11. Usuários e credenciais (esperado hoje: ADMIN 1, STUDENT 2; todos com 1 credencial 'credential' com hash)
SELECT u.role::text AS papel, count(*) AS total,
       count(*) FILTER (WHERE u."disabledAt" IS NOT NULL) AS desativados,
       count(*) FILTER (WHERE u."emailVerified") AS email_verificado,
       count(*) FILTER (WHERE u.email <> lower(btrim(u.email))) AS email_fora_do_padrao,
       count(*) FILTER (WHERE cred.n = 0) AS sem_credencial,
       count(*) FILTER (WHERE cred.n > 1) AS credencial_duplicada,
       count(*) FILTER (WHERE cred.sem_hash > 0) AS credencial_sem_hash,
       count(*) FILTER (WHERE cred.account_id_divergente > 0) AS account_id_divergente
FROM users u
CROSS JOIN LATERAL (
  SELECT count(*) AS n, count(*) FILTER (WHERE a.password IS NULL) AS sem_hash,
         count(*) FILTER (WHERE a."accountId" <> a."userId") AS account_id_divergente
  FROM auth_accounts a WHERE a."userId" = u.id AND a."providerId" = 'credential'
) cred
GROUP BY u.role ORDER BY 1;

SELECT "providerId" AS provedor, count(*) AS contas FROM auth_accounts GROUP BY 1 ORDER BY 1;

-- 12. Sessões e verificações (sessões de conta desativada já são recusadas pelo guard; anotar mesmo assim)
SELECT count(*) AS sessoes,
       count(*) FILTER (WHERE s."expiresAt" > now() AT TIME ZONE 'UTC') AS sessoes_ativas,
       count(DISTINCT s."userId") FILTER (WHERE s."expiresAt" > now() AT TIME ZONE 'UTC') AS usuarios_com_sessao_ativa,
       count(*) FILTER (WHERE s."expiresAt" > now() AT TIME ZONE 'UTC' AND u."disabledAt" IS NOT NULL) AS ativas_de_desativados,
       (SELECT count(*) FROM auth_verifications) AS verificacoes,
       (SELECT count(*) FROM auth_verifications WHERE "expiresAt" <= now() AT TIME ZONE 'UTC') AS verificacoes_expiradas
FROM auth_sessions s LEFT JOIN users u ON u.id = s."userId";

-- 13. Assinaturas, planos e pagamentos (o 08 depende disto: aluno sem assinatura vigente só acessa por concessão)
SELECT status, count(*) AS total,
       count(*) FILTER (WHERE "startDate" <= now() AT TIME ZONE 'UTC' AND "endDate" > now() AT TIME ZONE 'UTC') AS no_periodo
FROM subscriptions GROUP BY status ORDER BY 1;

SELECT u.role::text AS papel, count(*) AS usuarios,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM subscriptions s WHERE s."userId" = u.id AND s.status = 'active'
           AND s."startDate" <= now() AT TIME ZONE 'UTC' AND s."endDate" > now() AT TIME ZONE 'UTC')) AS com_assinatura_vigente
FROM users u GROUP BY u.role ORDER BY 1;

SELECT status, count(*) AS pagamentos, sum(amount) AS soma_centavos,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(p.email))) AS sem_usuario_com_mesmo_email
FROM payments p GROUP BY status ORDER BY 1;

SELECT (SELECT count(*) FROM plans) AS planos,
       (SELECT count(*) FROM lessons WHERE status = 'PUBLISHED') AS aulas_publicadas,
       (SELECT count(*) FROM lessons WHERE status = 'DRAFT') AS aulas_rascunho,
       (SELECT count(*) FROM lessons WHERE status = 'ARCHIVED') AS aulas_arquivadas;

-- 14. Integridade referencial e unicidade (esperado: TODOS os valores 0)
SELECT
  (SELECT count(*) FROM auth_accounts a WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a."userId")) AS contas_orfas,
  (SELECT count(*) FROM auth_sessions s WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s."userId")) AS sessoes_orfas,
  (SELECT count(*) FROM subscriptions s WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s."userId")) AS assinaturas_sem_usuario,
  (SELECT count(*) FROM subscriptions s WHERE NOT EXISTS (SELECT 1 FROM plans p WHERE p.id = s."planId")) AS assinaturas_sem_plano,
  (SELECT count(*) FROM (SELECT lower(btrim(email)) FROM users GROUP BY 1 HAVING count(*) > 1) d) AS emails_duplicados_sem_caixa,
  (SELECT count(*) FROM (SELECT "providerId", "accountId" FROM auth_accounts GROUP BY 1, 2 HAVING count(*) > 1) d) AS contas_duplicadas,
  (SELECT count(*) FROM (SELECT token FROM auth_sessions GROUP BY 1 HAVING count(*) > 1) d) AS tokens_duplicados,
  (SELECT count(*) FROM (SELECT "mercadopagoId" FROM payments GROUP BY 1 HAVING count(*) > 1) d) AS pagamentos_duplicados,
  (SELECT count(*) FROM subscriptions WHERE "endDate" <= "startDate") AS assinaturas_periodo_invalido,
  (SELECT count(*) FROM (SELECT s."userId" FROM subscriptions s WHERE s.status = 'active'
     AND s."startDate" <= now() AT TIME ZONE 'UTC' AND s."endDate" > now() AT TIME ZONE 'UTC'
     GROUP BY 1 HAVING count(*) > 1) d) AS usuarios_com_2_assinaturas_vigentes;

-- 15. Impressões digitais (comparar linha a linha entre execuções; 04/06/08 não podem alterá-las).
--     credenciais inclui o hash da senha (só o md5 agregado sai daqui) => prova que nenhuma senha mudou.
--     sessoes muda com qualquer login/logout: compare só se a janela estiver sem uso.
SELECT 'users' AS conjunto, count(*) AS linhas,
       md5(coalesce(string_agg(md5(row(id, email, role, "disabledAt", "createdAt", "emailVerified", name)::text), '' ORDER BY id), '')) AS impressao
FROM users
UNION ALL SELECT 'credenciais', count(*),
       md5(coalesce(string_agg(md5(row(id, "userId", "providerId", "accountId", password)::text), '' ORDER BY id), ''))
FROM auth_accounts
UNION ALL SELECT 'sessoes', count(*),
       md5(coalesce(string_agg(md5(row(id, "userId", "expiresAt")::text), '' ORDER BY id), ''))
FROM auth_sessions
UNION ALL SELECT 'plans', count(*),
       md5(coalesce(string_agg(md5(row(id, name, price, duration, "createdAt")::text), '' ORDER BY id), ''))
FROM plans
UNION ALL SELECT 'subscriptions', count(*),
       md5(coalesce(string_agg(md5(row(id, "userId", "planId", status, "startDate", "endDate", "createdAt")::text), '' ORDER BY id), ''))
FROM subscriptions
UNION ALL SELECT 'payments', count(*),
       md5(coalesce(string_agg(md5(row(id, "mercadopagoId", email, plan, status, amount, "createdAt")::text), '' ORDER BY id), ''))
FROM payments
UNION ALL SELECT 'lessons', count(*),
       md5(coalesce(string_agg(md5(row(id, title, status, position, "updatedAt")::text), '' ORDER BY id), ''))
FROM lessons;

-- 16. Atividade concorrente (antes de migrar: nenhuma transação longa, nenhuma trava nas 8 tabelas)
SELECT state AS estado, count(*) AS conexoes,
       max(now() - xact_start) FILTER (WHERE xact_start IS NOT NULL) AS transacao_mais_longa,
       count(*) FILTER (WHERE wait_event_type = 'Lock') AS esperando_trava
FROM pg_stat_activity
WHERE datname = current_database() AND pid <> pg_backend_pid()
GROUP BY state ORDER BY 1;

SELECT l.relation::regclass AS tabela, l.mode AS modo, l.granted AS concedida, count(*) AS travas
FROM pg_locks l
WHERE l.pid <> pg_backend_pid() AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND l.relation IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace
                     AND relname IN ('users', 'auth_accounts', 'auth_sessions', 'auth_verifications', 'plans', 'subscriptions', 'payments', 'lessons'))
GROUP BY 1, 2, 3 ORDER BY 1, 2;

-- 17. Privilégios necessários para 04/06/08 (esperado: todos true)
SELECT has_schema_privilege('public', 'CREATE') AS cria_no_public,
       pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = 'public.users'::regclass), 'MEMBER') AS altera_users,
       has_table_privilege('public.users', 'REFERENCES') AS referencia_users,
       EXISTS (SELECT 1 FROM pg_language WHERE lanname = 'plpgsql') AS plpgsql_instalado;

-- 18. Trava final: falha (ERROR) se houver bloqueio de compatibilidade/integridade ou bloco parcial.
DO $check$
DECLARE
  problems text[] := ARRAY[]::text[];
  missing text;
  n bigint;
  b04 int; b06 int; b08 int;
BEGIN
  IF pg_is_in_recovery() THEN problems := array_append(problems, ('conectado a uma réplica de leitura (usar o host direto do primário)')::text); END IF;
  IF current_setting('server_version_num')::int < 110000 THEN problems := array_append(problems, ('PostgreSQL < 11 (ADD COLUMN com default reescreveria users)')::text); END IF;
  IF current_setting('server_encoding') <> 'UTF8' THEN problems := array_append(problems, ('codificação do servidor diferente de UTF8')::text); END IF;

  IF (SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid = to_regtype('public."Role"'))
   IS DISTINCT FROM ARRAY['ADMIN', 'STUDENT'] THEN problems := array_append(problems, ('enum "Role" ausente ou com valores diferentes')::text); END IF;
  IF (SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid = to_regtype('public."LessonStatus"'))
   IS DISTINCT FROM ARRAY['DRAFT', 'PUBLISHED', 'ARCHIVED'] THEN problems := array_append(problems, ('enum "LessonStatus" ausente ou com valores diferentes')::text); END IF;

  SELECT string_agg(c.table_name::text || '.' || c.column_name::text, ', ') INTO missing
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.is_nullable = 'NO' AND c.column_default IS NULL
    AND c.table_name IN ('users', 'auth_accounts', 'auth_sessions', 'auth_verifications', 'plans', 'subscriptions', 'payments', 'lessons')
    AND (c.table_name::text, c.column_name::text) NOT IN (
      ('users', 'id'), ('users', 'email'), ('auth_accounts', 'id'), ('auth_accounts', 'accountId'), ('auth_accounts', 'providerId'),
      ('auth_accounts', 'userId'), ('auth_sessions', 'id'), ('auth_sessions', 'token'), ('auth_sessions', 'userId'),
      ('auth_sessions', 'expiresAt'), ('auth_verifications', 'id'), ('auth_verifications', 'identifier'), ('auth_verifications', 'value'),
      ('auth_verifications', 'expiresAt'), ('plans', 'id'), ('plans', 'name'), ('plans', 'price'), ('plans', 'duration'),
      ('subscriptions', 'id'), ('subscriptions', 'userId'), ('subscriptions', 'planId'), ('subscriptions', 'status'),
      ('subscriptions', 'endDate'), ('payments', 'id'), ('payments', 'mercadopagoId'), ('payments', 'email'), ('payments', 'plan'),
      ('payments', 'status'), ('payments', 'amount'), ('lessons', 'id'), ('lessons', 'title'), ('lessons', 'description'),
      ('lessons', 'videoUrl'), ('lessons', 'durationMinutes'), ('lessons', 'position'), ('lessons', 'updatedAt'),
      -- Prisma fills these itself (@default(now()) / @updatedAt / @default(...)) even without a database default:
      ('users', 'createdAt'), ('users', 'emailVerified'), ('users', 'role'), ('users', 'updatedAt'),
      ('auth_accounts', 'createdAt'), ('auth_accounts', 'updatedAt'), ('auth_sessions', 'createdAt'), ('auth_sessions', 'updatedAt'),
      ('auth_verifications', 'createdAt'), ('auth_verifications', 'updatedAt'), ('plans', 'createdAt'),
      ('subscriptions', 'startDate'), ('subscriptions', 'createdAt'), ('payments', 'createdAt'),
      ('lessons', 'status'), ('lessons', 'createdAt'));
  IF missing IS NOT NULL THEN problems := array_append(problems, (('colunas NOT NULL sem default desconhecidas pelo Prisma: ' || missing))::text); END IF;

  SELECT count(*) INTO n FROM auth_accounts a WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a."userId");
  IF n > 0 THEN problems := array_append(problems, (format('%s credenciais órfãs', n))::text); END IF;
  SELECT count(*) INTO n FROM auth_sessions s WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s."userId");
  IF n > 0 THEN problems := array_append(problems, (format('%s sessões órfãs', n))::text); END IF;
  SELECT count(*) INTO n FROM subscriptions s
  WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s."userId") OR NOT EXISTS (SELECT 1 FROM plans p WHERE p.id = s."planId");
  IF n > 0 THEN problems := array_append(problems, (format('%s assinaturas sem usuário ou plano', n))::text); END IF;
  SELECT count(*) INTO n FROM (SELECT lower(btrim(email)) FROM users GROUP BY 1 HAVING count(*) > 1) d;
  IF n > 0 THEN problems := array_append(problems, (format('%s e-mails duplicados ignorando maiúsculas', n))::text); END IF;
  SELECT count(*) INTO n FROM users u WHERE u.role = 'ADMIN' AND u."disabledAt" IS NULL AND EXISTS (
    SELECT 1 FROM auth_accounts a WHERE a."userId" = u.id AND a."providerId" = 'credential' AND a."accountId" = u.id AND a.password IS NOT NULL);
  IF n = 0 THEN problems := array_append(problems, ('nenhum ADMIN habilitado com credencial válida')::text); END IF;

  IF NOT has_schema_privilege('public', 'CREATE')
     OR NOT pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = 'public.users'::regclass), 'MEMBER') THEN
    problems := array_append(problems, ('usuário SQL sem CREATE no public ou sem posse de users')::text);
  END IF;

  b04 := (to_regclass('public.materials') IS NOT NULL)::int + (to_regclass('public.material_assets') IS NOT NULL)::int
     + (to_regtype('public."MaterialStatus"') IS NOT NULL)::int + (to_regtype('public."MaterialAssetStatus"') IS NOT NULL)::int;
  b06 := (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'
          AND column_name IN ('isPrincipalAdmin', 'mustChangePassword'))
     + (to_regclass('public.admin_audit_events') IS NOT NULL)::int + (to_regtype('public."AdminAuditAction"') IS NOT NULL)::int
     + (to_regprocedure('public.users_principal_admin_guard()') IS NOT NULL)::int
     + (to_regprocedure('public.admin_audit_events_append_only()') IS NOT NULL)::int;
  b08 := (to_regclass('public.manual_access_grants') IS NOT NULL)::int + (to_regclass('public.manual_access_events') IS NOT NULL)::int
     + (to_regtype('public."ManualAccessAction"') IS NOT NULL)::int
     + (to_regprocedure('public.manual_access_grants_guard()') IS NOT NULL)::int
     + (to_regprocedure('public.manual_access_no_delete()') IS NOT NULL)::int;
  IF b04 NOT IN (0, 4) THEN problems := array_append(problems, ('bloco 04 PARCIAL')::text); END IF;
  IF b06 NOT IN (0, 6) THEN problems := array_append(problems, ('bloco 06 PARCIAL')::text); END IF;
  IF b08 NOT IN (0, 5) THEN problems := array_append(problems, ('bloco 08 PARCIAL')::text); END IF;
  IF b08 > 0 AND b06 = 0 THEN problems := array_append(problems, ('08 presente sem o 06')::text); END IF;

  -- Names a still-absent block will create but that another object already uses (same list as section 5).
  SELECT string_agg(n.nome, ', ' ORDER BY n.nome) INTO missing
  FROM (VALUES ('materials_pkey'), ('material_assets_pkey'), ('materials_status_displayOrder_idx'),
             ('material_assets_storageKey_key'), ('material_assets_materialId_status_idx'),
             ('material_assets_materialId_version_key'), ('material_assets_one_validated'),
             ('admin_audit_events_pkey'), ('admin_audit_events_targetUserId_createdAt_idx'),
             ('admin_audit_events_actorId_createdAt_idx'), ('manual_access_grants_pkey'), ('manual_access_grants_userId_key'),
             ('manual_access_grants_grantedById_idx'), ('manual_access_grants_revokedById_idx'), ('manual_access_events_pkey'),
             ('manual_access_events_grantId_createdAt_idx'), ('manual_access_events_targetUserId_createdAt_idx'),
             ('manual_access_events_actorId_createdAt_idx')) AS n(nome)
  WHERE EXISTS (SELECT 1 FROM pg_class c WHERE c.relname = n.nome AND c.relnamespace = 'public'::regnamespace)
  AND (b04 = 0 AND n.nome LIKE 'material%' OR b06 = 0 AND n.nome LIKE 'admin_audit%' OR b08 = 0 AND n.nome LIKE 'manual_access%');
  IF missing IS NOT NULL THEN problems := array_append(problems, ('nomes já ocupados por outro objeto: ' || missing)::text); END IF;

  IF cardinality(problems) > 0 THEN
  RAISE EXCEPTION 'AUDITORIA: % problema(s): %', cardinality(problems), array_to_string(problems, ' | ');
  END IF;
END
$check$;

-- 19. Resultado (só aparece se a trava 18 passou)
SELECT 'AUDITORIA_OK' AS resultado, now() AT TIME ZONE 'UTC' AS em_utc;

ROLLBACK;
