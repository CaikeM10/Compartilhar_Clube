-- =====================================================================
-- 08 — LIBERAÇÃO MANUAL DE ACESSO: concessões administrativas e auditoria própria
-- =====================================================================
-- Arquivo reutilizável: cada execução exige autorização explícita para o banco alvo (local, branch Neon, produção).
-- A pré-condição recusa reexecução no mesmo banco. Histórico de execução: README desta pasta, seção 15
-- (resumo: aplicado apenas no PostgreSQL local de testes; branch Neon e produção NÃO aplicados).
-- Aditivo e não destrutivo:
--   * novo tipo "ManualAccessAction" e novas tabelas manual_access_grants (1 linha por aluno) e
--     manual_access_events (somente inclusão; UPDATE/DELETE/TRUNCATE recusados);
--   * concessões nunca são apagadas (revogação lógica) e só valem para ALUNO habilitado, gravadas por ADMIN.
-- Nenhuma tabela existente é alterada. Nenhum usuário, credencial, sessão, plano, assinatura, pagamento, aula ou
-- material é alterado. Não cria plano, assinatura nem pagamento.
--
-- DEPENDE DO 06 (gerenciamento de usuários) já aplicado no mesmo banco.
-- ORDEM OBRIGATÓRIA: aplicar ANTES de publicar o código que lê as tabelas novas. O código atual ignora as tabelas.
-- Publicar o código antes faria alunos SEM assinatura paga receberem 503 nas áreas exclusivas (os pagantes não são
-- afetados: a assinatura é verificada primeiro).
--
-- O bloco entre os marcadores é idêntico a prisma/proposals/manual-access.sql (tests/manual-access-sql.test.cjs).
--   psql "<conexão DIRETA>" -v ON_ERROR_STOP=1 -f 08-manual-access.sql
-- =====================================================================

SET client_encoding = 'UTF8';
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public;

DO $precondition$
BEGIN
  IF to_regclass('public.users') IS NULL OR to_regtype('public."Role"') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: schema de autenticação (01) ausente';
  END IF;
  IF to_regclass('public.admin_audit_events') IS NULL OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'mustChangePassword') THEN
    RAISE EXCEPTION 'PRECONDITION: gerenciamento de usuários (06) ausente — aplicar o 06 antes';
  END IF;
  IF to_regclass('public.manual_access_grants') IS NOT NULL OR to_regclass('public.manual_access_events') IS NOT NULL
     OR to_regtype('public."ManualAccessAction"') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDITION: 08 já aplicado (total ou parcialmente) — analisar manualmente';
  END IF;
END
$precondition$;

CREATE TEMP TABLE "_08_before" ON COMMIT DROP AS
SELECT (SELECT count(*) FROM "users") AS users,
       (SELECT count(*) FROM "auth_accounts") AS accounts,
       (SELECT count(*) FROM "auth_sessions") AS sessions,
       (SELECT count(*) FROM "plans") AS plans,
       (SELECT count(*) FROM "subscriptions") AS subscriptions,
       (SELECT count(*) FROM "payments") AS payments;

-- >>> prisma/proposals/manual-access.sql
-- Proposal only: manual (administrative) access to the exclusive contents, independent from the financial model.
-- Additive and non-destructive: one enum, two new tables, constraints and triggers. No existing table is altered and
-- no row of users, auth_*, plans, subscriptions, payments, lessons or materials is touched.
-- Wrapped (verbatim, between markers) by docs/producao-migracao/08-manual-access.sql. Never applied automatically.

CREATE TYPE "ManualAccessAction" AS ENUM ('GRANTED', 'RENEWED', 'REVOKED');

-- One row per student: the current (or last) administrative grant. History lives in manual_access_events.
-- Valid while "revokedAt" IS NULL AND "startsAt" <= now < "endsAt" (expiry needs no job: every check compares dates).
CREATE TABLE "manual_access_grants" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "grantedById" TEXT NOT NULL,
  "revokedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "manual_access_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "manual_access_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "manual_access_grants_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "manual_access_grants_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "manual_access_grants_period_check" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "manual_access_grants_revocation_check" CHECK (("revokedAt" IS NULL) = ("revokedById" IS NULL)),
  -- An administrator never grants or revokes access for their own account.
  CONSTRAINT "manual_access_grants_actor_check" CHECK (
    "grantedById" <> "userId" AND ("revokedById" IS NULL OR "revokedById" <> "userId"))
);

-- At most one grant row per student: duplicate concurrent grants fail with a unique violation.
CREATE UNIQUE INDEX "manual_access_grants_userId_key" ON "manual_access_grants"("userId");
CREATE INDEX "manual_access_grants_grantedById_idx" ON "manual_access_grants"("grantedById");
CREATE INDEX "manual_access_grants_revokedById_idx" ON "manual_access_grants"("revokedById");

-- Append-only audit trail. No e-mail, password or hash: only ids, action and the period before/after.
CREATE TABLE "manual_access_events" (
  "id" TEXT NOT NULL,
  "action" "ManualAccessAction" NOT NULL,
  "grantId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "previousStartsAt" TIMESTAMP(3),
  "previousEndsAt" TIMESTAMP(3),
  "newStartsAt" TIMESTAMP(3),
  "newEndsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "manual_access_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "manual_access_events_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "manual_access_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "manual_access_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "manual_access_events_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "manual_access_events_actor_check" CHECK ("actorId" <> "targetUserId"),
  CONSTRAINT "manual_access_events_period_check" CHECK (
    ("action" = 'GRANTED' AND "newStartsAt" IS NOT NULL AND "newEndsAt" > "newStartsAt"
       AND ("previousStartsAt" IS NULL) = ("previousEndsAt" IS NULL)) OR
    ("action" = 'RENEWED' AND "previousStartsAt" IS NOT NULL AND "previousEndsAt" IS NOT NULL
       AND "newStartsAt" IS NOT NULL AND "newEndsAt" > "newStartsAt" AND "newEndsAt" > "previousEndsAt") OR
    ("action" = 'REVOKED' AND "previousStartsAt" IS NOT NULL AND "previousEndsAt" IS NOT NULL
       AND "newStartsAt" IS NULL AND "newEndsAt" IS NULL))
);

CREATE INDEX "manual_access_events_grantId_createdAt_idx" ON "manual_access_events"("grantId", "createdAt");
CREATE INDEX "manual_access_events_targetUserId_createdAt_idx" ON "manual_access_events"("targetUserId", "createdAt");
CREATE INDEX "manual_access_events_actorId_createdAt_idx" ON "manual_access_events"("actorId", "createdAt");

-- Defense in depth for the application rules: a grant that can give access always targets an enabled STUDENT and is
-- written by an ADMIN; a revocation is written by an ADMIN (and is allowed whatever the target became meanwhile).
CREATE FUNCTION "manual_access_grants_guard"() RETURNS trigger
LANGUAGE plpgsql AS $guard$
BEGIN
  IF NEW."revokedAt" IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = NEW."userId" AND "role" = 'STUDENT' AND "disabledAt" IS NULL) THEN
      RAISE EXCEPTION 'MANUAL_ACCESS_TARGET_NOT_STUDENT';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = NEW."grantedById" AND "role" = 'ADMIN') THEN
      RAISE EXCEPTION 'MANUAL_ACCESS_ACTOR_NOT_ADMIN';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = NEW."revokedById" AND "role" = 'ADMIN') THEN
    RAISE EXCEPTION 'MANUAL_ACCESS_ACTOR_NOT_ADMIN';
  END IF;
  RETURN NEW;
END
$guard$;

CREATE TRIGGER "manual_access_grants_guard"
  BEFORE INSERT OR UPDATE ON "manual_access_grants"
  FOR EACH ROW EXECUTE FUNCTION "manual_access_grants_guard"();

-- Grants are revoked logically (revokedAt), never deleted; events are append-only.
CREATE FUNCTION "manual_access_no_delete"() RETURNS trigger
LANGUAGE plpgsql AS $nodelete$
BEGIN
  RAISE EXCEPTION 'MANUAL_ACCESS_APPEND_ONLY';
END
$nodelete$;

CREATE TRIGGER "manual_access_grants_no_delete"
  BEFORE DELETE ON "manual_access_grants"
  FOR EACH ROW EXECUTE FUNCTION "manual_access_no_delete"();
CREATE TRIGGER "manual_access_grants_no_truncate"
  BEFORE TRUNCATE ON "manual_access_grants"
  FOR EACH STATEMENT EXECUTE FUNCTION "manual_access_no_delete"();
CREATE TRIGGER "manual_access_events_no_update_delete"
  BEFORE UPDATE OR DELETE ON "manual_access_events"
  FOR EACH ROW EXECUTE FUNCTION "manual_access_no_delete"();
CREATE TRIGGER "manual_access_events_no_truncate"
  BEFORE TRUNCATE ON "manual_access_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "manual_access_no_delete"();
-- <<< prisma/proposals/manual-access.sql

DO $postcondition$
DECLARE
  before record;
BEGIN
  SELECT * INTO before FROM "_08_before";
  IF (SELECT count(*) FROM "users") <> before.users OR (SELECT count(*) FROM "auth_accounts") <> before.accounts
     OR (SELECT count(*) FROM "auth_sessions") <> before.sessions THEN
    RAISE EXCEPTION 'POSTCONDITION: contagens de usuários, credenciais ou sessões mudaram';
  END IF;
  IF (SELECT count(*) FROM "plans") <> before.plans OR (SELECT count(*) FROM "subscriptions") <> before.subscriptions
     OR (SELECT count(*) FROM "payments") <> before.payments THEN
    RAISE EXCEPTION 'POSTCONDITION: contagens financeiras mudaram';
  END IF;
  IF EXISTS (SELECT 1 FROM "manual_access_grants") OR EXISTS (SELECT 1 FROM "manual_access_events") THEN
    RAISE EXCEPTION 'POSTCONDITION: concessões e auditoria devem começar vazias';
  END IF;
END
$postcondition$;

COMMIT;
