-- =====================================================================
-- 03 — VERIFICAÇÃO PÓS-MIGRAÇÃO (SOMENTE LEITURA)
-- =====================================================================
-- Rodar logo após 01/02 e de novo após provisionar o primeiro admin.
-- Compare a seção 2 com os números anotados na seção 8 da inspeção (00).
-- Nenhuma consulta devolve senha, hash, token ou e-mail.
-- =====================================================================

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

-- 1. Estrutura esperada
SELECT name, to_regclass(format('public.%I', name)) IS NOT NULL AS exists
FROM unnest(ARRAY['users', 'plans', 'subscriptions', 'payments',
                  'auth_accounts', 'auth_sessions', 'auth_verifications', 'lessons']) AS name;

SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace AND contype = 'f'
ORDER BY 1, 2;

-- 2. Dados preservados (devem ser IGUAIS aos da inspeção 00, seção 8,
--    salvo novos cadastros/pagamentos legítimos ocorridos no intervalo)
SELECT (SELECT count(*) FROM users)         AS users,
       (SELECT count(*) FROM plans)         AS plans,
       (SELECT count(*) FROM subscriptions) AS subscriptions,
       (SELECT count(*) FROM payments)      AS payments;

-- 3. Papéis e estado de autenticação
SELECT role, count(*) AS total,
       count(*) FILTER (WHERE "disabledAt" IS NOT NULL) AS disabled,
       count(*) FILTER (WHERE "emailVerified") AS email_verified
FROM users GROUP BY role ORDER BY role;
-- Logo após 01: somente STUDENT. Após provisionar: exatamente 1 ADMIN.

SELECT "providerId", count(*) AS accounts,
       count(*) FILTER (WHERE password IS NOT NULL) AS with_password_hash,
       count(*) FILTER (WHERE "accountId" <> "userId") AS credential_mismatch -- deve ser 0 para 'credential'
FROM auth_accounts GROUP BY "providerId";

-- 4. O administrador tem credencial válida para o Better Auth
--    (providerId 'credential' e accountId = users.id, e-mail já em minúsculas)
SELECT count(*) AS admins,
       count(*) FILTER (WHERE a.id IS NOT NULL) AS admins_with_credential,
       count(*) FILTER (WHERE u.email = lower(u.email)) AS admins_lowercase_email,
       count(*) FILTER (WHERE u."disabledAt" IS NULL) AS admins_enabled
FROM users u
LEFT JOIN auth_accounts a
  ON a."userId" = u.id AND a."providerId" = 'credential' AND a."accountId" = u.id AND a.password IS NOT NULL
WHERE u.role = 'ADMIN';

-- 5. Sessões
SELECT count(*) AS sessions,
       count(*) FILTER (WHERE "expiresAt" > now()) AS active_sessions
FROM auth_sessions;

-- 6. Aulas
SELECT status, count(*) FROM lessons GROUP BY status;

-- 7. Impressão digital dos dados legados — logo após 01/02 deve ser IDÊNTICA à seção 18 do 00.
--    Cobre só colunas legadas (role/updatedAt/etc. não entram). Após o provisionamento:
--      * link-existing: continua idêntica (só cria auth_accounts e muda role);
--      * create: "users" ganha 1 linha, então rows e fingerprint de users mudam; as demais tabelas não.
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
