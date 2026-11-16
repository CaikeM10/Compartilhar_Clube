-- =====================================================================
-- 00 — INSPEÇÃO SOMENTE LEITURA DO BANCO DE PRODUÇÃO (Neon)
-- =====================================================================
-- Execução: somente com autorização, por quem tem acesso ao Neon.
-- Preferir psql com conexão DIRETA (host sem "-pooler"):
--   psql "<conexão>" -v ON_ERROR_STOP=1 -f 00-inspecao-somente-leitura.sql
-- No SQL Editor do Neon, executar bloco a bloco.
--
-- Garantias deste arquivo:
--   * Toda a sessão roda em transação READ ONLY e termina em ROLLBACK.
--   * Nenhuma consulta devolve senha, hash, token, nome ou e-mail;
--     apenas estrutura e contagens agregadas.
--   * As consultas marcadas "[PII OPCIONAL]" estão comentadas: só
--     descomente se precisar identificar registros e não compartilhe
--     o resultado fora do ambiente seguro.
-- =====================================================================

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

-- 1. Identidade do servidor (confirme que é o banco/branch de produção esperado)
SELECT current_database() AS database,
       current_user       AS sql_user,
       current_setting('server_version') AS server_version,
       current_setting('server_version_num')::int AS server_version_num,
       current_setting('transaction_read_only') AS read_only; -- deve ser "on"

-- 2. Tabelas existentes no schema public (esperado hoje: users, plans, subscriptions, payments)
SELECT c.relname AS table_name,
       pg_get_userbyid(c.relowner) AS owner,
       c.reltuples::bigint AS estimated_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
       c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
ORDER BY c.relname;

-- 3. Objetos que a migração vai criar NÃO podem existir (esperado: todas "false")
SELECT name, to_regclass(format('public.%I', name)) IS NOT NULL AS exists
FROM unnest(ARRAY['auth_accounts', 'auth_sessions', 'auth_verifications',
                  'lessons', 'materials', 'material_assets', '_prisma_migrations']) AS name;

SELECT t.typname AS enum_name, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS labels
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
LEFT JOIN pg_enum e ON e.enumtypid = t.oid
WHERE n.nspname = 'public' AND t.typtype = 'e'
GROUP BY t.typname
ORDER BY t.typname;  -- esperado hoje: nenhuma linha ("Role", "LessonStatus" etc. ainda inexistentes)

-- 4. Colunas reais das tabelas legadas (comparar com docs/auth-preparation/before.prisma)
SELECT table_name, ordinal_position, column_name, data_type, udt_name,
       datetime_precision, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('users', 'plans', 'subscriptions', 'payments')
ORDER BY table_name, ordinal_position;
-- Esperado em users: id(text), name(text, null), email(text), password(text, null), createdAt(timestamp(3))
-- e NENHUMA das colunas: emailVerified, image, role, disabledAt, updatedAt.

-- 5. Constraints (PK, UNIQUE, FK, CHECK) das tabelas legadas
SELECT conrelid::regclass AS table_name, conname, contype,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid::regclass::text IN ('users', 'plans', 'subscriptions', 'payments')
ORDER BY 1, 2;

-- 6. Índices das tabelas legadas
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('users', 'plans', 'subscriptions', 'payments')
ORDER BY tablename, indexname;

-- 7. Triggers, views e políticas que dependem de "users" (podem reagir a ALTER TABLE)
SELECT tgrelid::regclass AS table_name, tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgrelid::regclass::text IN ('users', 'plans', 'subscriptions', 'payments');

SELECT DISTINCT dependent.relname AS dependent_view
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class dependent ON dependent.oid = r.ev_class
WHERE d.refobjid = 'public.users'::regclass AND dependent.relname <> 'users';

SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public';

-- 8. Volume exato (tabelas pequenas; anote os números — serão comparados após a migração)
SELECT (SELECT count(*) FROM users)         AS users,
       (SELECT count(*) FROM plans)         AS plans,
       (SELECT count(*) FROM subscriptions) AS subscriptions,
       (SELECT count(*) FROM payments)      AS payments;

-- 9. Qualidade dos e-mails de users (Better Auth compara e-mail em minúsculas, igualdade exata)
SELECT count(*)                                                        AS total,
       count(*) FILTER (WHERE email <> lower(email))                   AS with_uppercase,
       count(*) FILTER (WHERE email <> btrim(email))                   AS with_outer_spaces,
       count(*) FILTER (WHERE email = '' OR email IS NULL)             AS empty,
       count(*) FILTER (WHERE email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')   AS malformed,
       count(*) FILTER (WHERE email <> normalize(email, NFC))          AS not_nfc
FROM users;

-- 9b. Grupos de e-mails que colidem ao normalizar (mesma pessoa com grafias diferentes)
SELECT count(*) AS colliding_groups, coalesce(sum(n), 0) AS colliding_rows
FROM (SELECT lower(btrim(email)) AS k, count(*) AS n
      FROM users GROUP BY 1 HAVING count(*) > 1) g;

-- [PII OPCIONAL] Identificar os registros com colisão ou maiúsculas:
-- SELECT id, email, "createdAt" FROM users
-- WHERE lower(btrim(email)) IN (SELECT lower(btrim(email)) FROM users GROUP BY 1 HAVING count(*) > 1)
--    OR email <> lower(email)
-- ORDER BY lower(btrim(email)), "createdAt";

-- 10. Campos legados de users (apenas contagens; NUNCA selecionar "password")
SELECT count(*) FILTER (WHERE name IS NULL)          AS name_null,
       count(*) FILTER (WHERE btrim(coalesce(name, '')) = '') AS name_blank,
       count(*) FILTER (WHERE password IS NOT NULL)  AS legacy_password_present
FROM users;

-- 11. Formato dos IDs (Better Auth/Prisma usam text; cuid ~25 chars). Só contagem por padrão.
SELECT count(*) FILTER (WHERE id ~ '^c[a-z0-9]{24}$') AS cuid_like,
       count(*) FILTER (WHERE id !~ '^c[a-z0-9]{24}$') AS other_format,
       min(length(id)) AS min_len, max(length(id)) AS max_len
FROM users;

-- 12. Integridade das relações financeiras
SELECT
  (SELECT count(*) FROM subscriptions s LEFT JOIN users u ON u.id = s."userId" WHERE u.id IS NULL) AS subs_without_user,
  (SELECT count(*) FROM subscriptions s LEFT JOIN plans p ON p.id = s."planId" WHERE p.id IS NULL) AS subs_without_plan,
  (SELECT count(*) FROM payments p
     WHERE NOT EXISTS (SELECT 1 FROM users u WHERE lower(btrim(u.email)) = lower(btrim(p.email)))) AS payments_email_without_user,
  (SELECT count(*) FROM payments p
     WHERE EXISTS (SELECT 1 FROM users u WHERE u.email = p.email)) AS payments_email_exact_match;

-- 13. Assinaturas: distribuição de status e regra de "ativa" usada pela aplicação
--     (status = 'active' AND startDate <= agora < endDate)
SELECT status,
       count(*) AS total,
       count(*) FILTER (WHERE "startDate" <= now() AND "endDate" > now()) AS currently_valid
FROM subscriptions GROUP BY status ORDER BY status;

SELECT count(DISTINCT "userId") AS users_with_active_subscription
FROM subscriptions
WHERE status = 'active' AND "startDate" <= now() AND "endDate" > now();

-- 14. Planos (dados comerciais não sensíveis; o webhook procura o plano por "name")
SELECT name, price, duration, "createdAt" FROM plans ORDER BY name;

-- 15. Pagamentos: distribuição (sem e-mail nem id do Mercado Pago)
SELECT status, plan, count(*) AS total, min("createdAt") AS first, max("createdAt") AS last
FROM payments GROUP BY status, plan ORDER BY status, plan;

-- 16. Permissões: o usuário SQL da migração precisa ser dono de "users" para ALTER TABLE
SELECT tablename, tableowner, tableowner = current_user AS current_user_is_owner
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('users', 'plans', 'subscriptions', 'payments');

SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_in_public;

-- 17. Atividade e locks no momento (ALTER TABLE users exige lock exclusivo breve)
SELECT state, count(*) AS connections,
       max(now() - xact_start) AS oldest_transaction
FROM pg_stat_activity
WHERE datname = current_database() AND pid <> pg_backend_pid()
GROUP BY state;

SELECT l.mode, l.granted, count(*) AS total
FROM pg_locks l
WHERE l.relation = 'public.users'::regclass
GROUP BY l.mode, l.granted;

-- 18. Impressão digital dos dados legados (md5 agregado das colunas legadas, ordenado por id).
--     Não expõe conteúdo. Deve ser IDÊNTICA na seção 7 do arquivo 03 após a migração.
--     Se uma coluna listada não existir, a consulta falha: isso indica drift em relação a before.prisma.
SELECT 'users' AS table_name, count(*) AS rows,
       md5(coalesce(string_agg(md5(row(id, name, email, password, "createdAt")::text), '' ORDER BY id), '')) AS fingerprint
FROM users
UNION ALL
SELECT 'plans', count(*),
       md5(coalesce(string_agg(md5(row(id, name, price, duration, "createdAt")::text), '' ORDER BY id), ''))
FROM plans
UNION ALL
SELECT 'subscriptions', count(*),
       md5(coalesce(string_agg(md5(row(id, "userId", "planId", status, "startDate", "endDate", "createdAt")::text), '' ORDER BY id), ''))
FROM subscriptions
UNION ALL
SELECT 'payments', count(*),
       md5(coalesce(string_agg(md5(row(id, "mercadopagoId", email, plan, status, amount, "createdAt")::text), '' ORDER BY id), ''))
FROM payments;

ROLLBACK;
