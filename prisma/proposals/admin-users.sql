-- Proposal only: admin user management (principal administrators, forced password change, audit trail).
-- Additive and non-destructive: new columns with defaults (no table rewrite), one new table, triggers.
-- Existing users keep isPrincipalAdmin = false and mustChangePassword = false; sessions are untouched.
-- Wrapped (verbatim, between markers) by docs/producao-migracao/06-admin-users.sql. Never applied automatically.

ALTER TABLE "users"
  ADD COLUMN "isPrincipalAdmin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- A principal administrator is always an ADMIN: demoting one fails even through direct SQL.
ALTER TABLE "users" ADD CONSTRAINT "users_principal_admin_role_check" CHECK (NOT "isPrincipalAdmin" OR "role" = 'ADMIN');

-- Principal designation is reserved to the operator procedure (scripts/principal-admin-operator.cjs), which sets
-- compartilhar.principal_designation = 'on' for its own transaction only. The application never sets it, so even a
-- bug in the panel cannot grant, revoke, demote or disable a principal administrator. At most two principals.
CREATE FUNCTION "users_principal_admin_guard"() RETURNS trigger
LANGUAGE plpgsql AS $guard$
DECLARE
  operator_procedure boolean := coalesce(current_setting('compartilhar.principal_designation', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."isPrincipalAdmin" THEN
      RAISE EXCEPTION 'PRINCIPAL_ADMIN_DESIGNATION_REQUIRED';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."isPrincipalAdmin" IS DISTINCT FROM OLD."isPrincipalAdmin" THEN
    IF NOT operator_procedure THEN
      RAISE EXCEPTION 'PRINCIPAL_ADMIN_DESIGNATION_REQUIRED';
    END IF;
    IF NEW."isPrincipalAdmin" THEN
      -- Serializes concurrent designations; each count runs after the previous designation committed.
      PERFORM pg_advisory_xact_lock(61420321);
      IF (SELECT count(*) FROM "users" WHERE "isPrincipalAdmin" AND "id" <> NEW."id") >= 2 THEN
        RAISE EXCEPTION 'PRINCIPAL_ADMIN_LIMIT_REACHED';
      END IF;
    END IF;
  END IF;
  IF OLD."isPrincipalAdmin" AND NOT operator_procedure AND (
       NEW."role" IS DISTINCT FROM OLD."role" OR NEW."disabledAt" IS DISTINCT FROM OLD."disabledAt" OR
       NEW."email" IS DISTINCT FROM OLD."email" OR NEW."id" IS DISTINCT FROM OLD."id") THEN
    RAISE EXCEPTION 'PRINCIPAL_ADMIN_PROTECTED';
  END IF;
  RETURN NEW;
END
$guard$;

CREATE TRIGGER "users_principal_admin_guard"
  BEFORE INSERT OR UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION "users_principal_admin_guard"();

CREATE TYPE "AdminAuditAction" AS ENUM ('USER_CREATED', 'ROLE_CHANGED', 'PRINCIPAL_DESIGNATED', 'OPERATOR_PASSWORD_RESET');

-- Append-only audit trail. No e-mail, password or hash: only ids, action and roles.
CREATE TABLE "admin_audit_events" (
  "id" TEXT NOT NULL,
  "action" "AdminAuditAction" NOT NULL,
  "actorId" TEXT,
  "targetUserId" TEXT NOT NULL,
  "previousRole" "Role",
  "newRole" "Role",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "admin_audit_events_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Panel actions always name the administrator responsible; only operator procedures have no panel actor.
  CONSTRAINT "admin_audit_events_actor_check" CHECK (
    ("action" IN ('USER_CREATED', 'ROLE_CHANGED') AND "actorId" IS NOT NULL AND "actorId" <> "targetUserId") OR
    ("action" IN ('PRINCIPAL_DESIGNATED', 'OPERATOR_PASSWORD_RESET') AND "actorId" IS NULL)),
  CONSTRAINT "admin_audit_events_role_check" CHECK (
    ("action" = 'USER_CREATED' AND "previousRole" IS NULL AND "newRole" IS NOT NULL) OR
    ("action" = 'ROLE_CHANGED' AND "previousRole" IS NOT NULL AND "newRole" IS NOT NULL AND "previousRole" <> "newRole") OR
    ("action" IN ('PRINCIPAL_DESIGNATED', 'OPERATOR_PASSWORD_RESET') AND "previousRole" IS NULL AND "newRole" IS NULL))
);

CREATE INDEX "admin_audit_events_targetUserId_createdAt_idx" ON "admin_audit_events"("targetUserId", "createdAt");
CREATE INDEX "admin_audit_events_actorId_createdAt_idx" ON "admin_audit_events"("actorId", "createdAt");

CREATE FUNCTION "admin_audit_events_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $audit$
BEGIN
  RAISE EXCEPTION 'ADMIN_AUDIT_APPEND_ONLY';
END
$audit$;

CREATE TRIGGER "admin_audit_events_no_update_delete"
  BEFORE UPDATE OR DELETE ON "admin_audit_events"
  FOR EACH ROW EXECUTE FUNCTION "admin_audit_events_append_only"();
CREATE TRIGGER "admin_audit_events_no_truncate"
  BEFORE TRUNCATE ON "admin_audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "admin_audit_events_append_only"();
