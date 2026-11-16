-- =====================================================================
-- 01 — MIGRAÇÃO INCREMENTAL: Better Auth (PROPOSTA — NÃO EXECUTADA)
-- =====================================================================
-- Origem: docs/auth-preparation/proposed.sql (gerado por prisma migrate diff
-- entre before.prisma e o schema atual), acrescido de pré e pós-condições.
--
-- Natureza: somente ADITIVA.
--   * Cria o enum "Role" e 3 tabelas novas (auth_accounts, auth_sessions,
--     auth_verifications) com índices e FKs.
--   * Adiciona 5 colunas a "users", todas nullable ou com DEFAULT constante.
--   * NÃO altera, renomeia, apaga ou reescreve colunas/linhas existentes.
--     users.password (legado) permanece intacto e sem uso.
--   * NÃO toca plans, subscriptions, payments.
--   * NÃO cria usuários, credenciais ou administradores.
--
-- Execução (somente após autorização, snapshot confirmado e ensaio em branch):
--   psql "<conexão DIRETA, sem -pooler>" -v ON_ERROR_STOP=1 -f 01-auth-better-auth.sql
--   (sem "-1": o arquivo já controla a própria transação com BEGIN/COMMIT)
-- Qualquer erro aborta a transação inteira: nada é aplicado.
-- =====================================================================

BEGIN;
-- Não esperar indefinidamente por lock em "users"; falhar e tentar depois.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public;

-- ---------------------------------------------------------------------
-- Pré-condições: o banco precisa estar EXATAMENTE no estado legado esperado.
-- Se algo divergir, aborta sem alterar nada (não usamos IF NOT EXISTS de
-- propósito: drift deve ser analisado, não mascarado).
-- ---------------------------------------------------------------------
DO $pre$
DECLARE
  missing text;
BEGIN
  -- Tabelas legadas presentes
  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY['users', 'plans', 'subscriptions', 'payments']) t
  WHERE to_regclass(format('public.%I', t)) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDITION: tabelas legadas ausentes: %', missing;
  END IF;

  -- Objetos novos ausentes
  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY['auth_accounts', 'auth_sessions', 'auth_verifications']) t
  WHERE to_regclass(format('public.%I', t)) IS NOT NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDITION: tabelas de auth já existem: %', missing;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role' AND typnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'PRECONDITION: tipo "Role" já existe';
  END IF;

  SELECT string_agg(column_name, ', ') INTO missing
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users'
    AND column_name IN ('emailVerified', 'image', 'role', 'disabledAt', 'updatedAt');
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDITION: colunas já existem em users: %', missing;
  END IF;

  -- Formato das colunas de que as novas FKs e o Better Auth dependem
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'users'
                   AND column_name = 'id' AND data_type = 'text') THEN
    RAISE EXCEPTION 'PRECONDITION: users.id não é text';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'users'
                   AND column_name = 'email' AND data_type = 'text' AND is_nullable = 'NO') THEN
    RAISE EXCEPTION 'PRECONDITION: users.email não é text NOT NULL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.users'::regclass AND contype = 'p') THEN
    RAISE EXCEPTION 'PRECONDITION: users sem chave primária';
  END IF;
END
$pre$;

-- Contagens e impressão digital das colunas legadas ANTES (comparadas no fim da mesma transação)
CREATE TEMP TABLE _migration_before ON COMMIT DROP AS
SELECT (SELECT count(*) FROM users)         AS users,
       (SELECT count(*) FROM plans)         AS plans,
       (SELECT count(*) FROM subscriptions) AS subscriptions,
       (SELECT count(*) FROM payments)      AS payments,
       (SELECT count(*) FROM users WHERE password IS NOT NULL) AS legacy_passwords,
       (SELECT md5(coalesce(string_agg(md5(row(id, name, email, password, "createdAt")::text), '' ORDER BY id), '')) FROM users) AS fp_users,
       (SELECT md5(coalesce(string_agg(md5(row(id, name, price, duration, "createdAt")::text), '' ORDER BY id), '')) FROM plans) AS fp_plans,
       (SELECT md5(coalesce(string_agg(md5(row(id, "userId", "planId", status, "startDate", "endDate", "createdAt")::text), '' ORDER BY id), '')) FROM subscriptions) AS fp_subscriptions,
       (SELECT md5(coalesce(string_agg(md5(row(id, "mercadopagoId", email, plan, status, amount, "createdAt")::text), '' ORDER BY id), '')) FROM payments) AS fp_payments;

-- ---------------------------------------------------------------------
-- DDL (idêntico a docs/auth-preparation/proposed.sql)
-- ---------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STUDENT');

-- AlterTable (PostgreSQL 11+: DEFAULT não volátil = alteração só de metadados,
-- sem reescrever a tabela; o lock exclusivo dura milissegundos)
ALTER TABLE "users" ADD COLUMN     "disabledAt" TIMESTAMP(3),
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'STUDENT',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "password" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (tabelas novas e vazias: sem custo nem lock relevante)
CREATE INDEX "auth_accounts_userId_idx" ON "auth_accounts"("userId");
CREATE UNIQUE INDEX "auth_accounts_providerId_accountId_key" ON "auth_accounts"("providerId", "accountId");
CREATE UNIQUE INDEX "auth_sessions_token_key" ON "auth_sessions"("token");
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications"("identifier");
CREATE INDEX "auth_verifications_expiresAt_idx" ON "auth_verifications"("expiresAt");

-- AddForeignKey (RESTRICT: impede apagar usuário com conta/sessão)
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Pós-condições: nenhum dado existente mudou; usuários continuam STUDENT,
-- nenhum ADMIN foi criado, tabelas novas vazias.
-- ---------------------------------------------------------------------
DO $post$
DECLARE
  b record;
BEGIN
  SELECT * INTO b FROM _migration_before;
  IF (SELECT count(*) FROM users) <> b.users
     OR (SELECT count(*) FROM plans) <> b.plans
     OR (SELECT count(*) FROM subscriptions) <> b.subscriptions
     OR (SELECT count(*) FROM payments) <> b.payments
     OR (SELECT count(*) FROM users WHERE password IS NOT NULL) <> b.legacy_passwords THEN
    RAISE EXCEPTION 'POSTCONDITION: contagens divergentes após a migração';
  END IF;
  IF (SELECT md5(coalesce(string_agg(md5(row(id, name, email, password, "createdAt")::text), '' ORDER BY id), '')) FROM users) <> b.fp_users
     OR (SELECT md5(coalesce(string_agg(md5(row(id, name, price, duration, "createdAt")::text), '' ORDER BY id), '')) FROM plans) <> b.fp_plans
     OR (SELECT md5(coalesce(string_agg(md5(row(id, "userId", "planId", status, "startDate", "endDate", "createdAt")::text), '' ORDER BY id), '')) FROM subscriptions) <> b.fp_subscriptions
     OR (SELECT md5(coalesce(string_agg(md5(row(id, "mercadopagoId", email, plan, status, amount, "createdAt")::text), '' ORDER BY id), '')) FROM payments) <> b.fp_payments THEN
    RAISE EXCEPTION 'POSTCONDITION: dados legados alterados (impressão digital divergente)';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE role <> 'STUDENT' OR "emailVerified" OR "disabledAt" IS NOT NULL OR image IS NOT NULL) THEN
    RAISE EXCEPTION 'POSTCONDITION: valores padrão inesperados em users';
  END IF;
  IF EXISTS (SELECT 1 FROM auth_accounts) OR EXISTS (SELECT 1 FROM auth_sessions)
     OR EXISTS (SELECT 1 FROM auth_verifications) THEN
    RAISE EXCEPTION 'POSTCONDITION: tabelas de auth não estão vazias';
  END IF;
END
$post$;

COMMIT;
