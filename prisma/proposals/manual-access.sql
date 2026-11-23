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
