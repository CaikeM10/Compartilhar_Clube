import "server-only";
import type { Prisma, PrismaClient, Role } from "@prisma/client";
import { AuthorizationError } from "@/lib/auth/authorization-core";
import { ADMIN_USER_ROW_SELECT, toAdminUserRow } from "./users-core";
import { insertGrant } from "./manual-access-core";
import { grantPeriod } from "./manual-access-rules";
import { parseChangeRole, parseCreateUser, UserManagementError } from "./user-validation";

/** Same advisory lock as scripts/provision-production-{admin,account}.cjs: account creation is serialized everywhere. */
export const ACCOUNT_PROVISIONING_LOCK = 61420319;

type Actor = { user: { id: string } };
export type UserManagementGuards = {
  requireAdmin: () => Promise<Actor>;
  requirePrincipalAdmin: () => Promise<Actor>;
};
/** Server-side Better Auth instance bound to the transaction (lib/auth/config.ts, `serverProvisioning`). */
export type ProvisioningAuth = {
  api: { signUpEmail: (context: { body: { name: string; email: string; password: string } }) => Promise<unknown> };
};
export type ProvisioningAuthFactory = (tx: Prisma.TransactionClient) => ProvisioningAuth;

const toRole = (role: "student" | "admin"): Role => (role === "admin" ? "ADMIN" : "STUDENT");

function createdUserId(result: unknown) {
  const user = (result as { user?: { id?: unknown } } | null)?.user;
  return typeof user?.id === "string" && user.id ? user.id : null;
}

/**
 * Account creation and role management for the admin panel. The guard is the first statement of every method and
 * the acting administrator is read again from the database inside the transaction (after the lock), so a role
 * removed meanwhile is honoured. Requested roles from the browser are requests, never authority.
 */
export function createUserManagementService(
  db: PrismaClient, guards: UserManagementGuards, createAuth: ProvisioningAuthFactory, now: () => Date = () => new Date(),
) {
  async function lockAndCheckActor(tx: Prisma.TransactionClient, actorId: string, principalRequired: boolean) {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${ACCOUNT_PROVISIONING_LOCK})`);
    const actor = await tx.user.findUnique({
      where: { id: actorId }, select: { role: true, isPrincipalAdmin: true, disabledAt: true, mustChangePassword: true },
    });
    if (!actor || actor.role !== "ADMIN" || actor.disabledAt !== null || actor.mustChangePassword === true) {
      throw new AuthorizationError(403, "FORBIDDEN");
    }
    if (principalRequired && actor.isPrincipalAdmin !== true) throw new AuthorizationError(403, "PRINCIPAL_ADMIN_REQUIRED");
  }

  async function create(input: unknown) {
    const actor = await guards.requireAdmin();
    const data = parseCreateUser(input);
    const role = toRole(data.role);
    // Only principal administrators may create administrators (re-read from the database by the guard).
    if (role === "ADMIN") await guards.requirePrincipalAdmin();
    // Optional manual access (students only, enforced by the parser): validated before anything is written.
    const at = now();
    const period = data.access ? grantPeriod(data.access.startDate, data.access.endDate, at) : null;
    if (data.access && !period) throw new UserManagementError(400, "INVALID_ACCESS_PERIOD");
    try {
      return await db.$transaction(async tx => {
        // Better Auth must write only through this transaction client; it must not be able to open its own.
        if ("$transaction" in tx) throw new Error("TRANSACTION_CLIENT_REQUIRED");
        await lockAndCheckActor(tx, actor.user.id, role === "ADMIN");
        if (await tx.user.count({ where: { email: { equals: data.email, mode: "insensitive" } } }) > 0) {
          throw new UserManagementError(409, "EMAIL_ALREADY_REGISTERED");
        }

        const id = createdUserId(await createAuth(tx).api.signUpEmail({
          body: { name: data.name, email: data.email, password: data.password },
        }));
        // With autoSignIn disabled, Better Auth answers a duplicate with a synthetic user: only a real row counts.
        const user = id ? await tx.user.findUnique({
          where: { id }, select: { id: true, email: true, role: true, disabledAt: true, isPrincipalAdmin: true },
        }) : null;
        if (!user) throw new UserManagementError(409, "EMAIL_ALREADY_REGISTERED");
        const accounts = await tx.account.findMany({ where: { userId: user.id }, select: { providerId: true, accountId: true, password: true } });
        if (user.email !== data.email || user.role !== "STUDENT" || user.disabledAt !== null || user.isPrincipalAdmin ||
            accounts.length !== 1 || accounts[0].providerId !== "credential" || accounts[0].accountId !== user.id ||
            !accounts[0].password || accounts[0].password === data.password) {
          throw new Error("ACCOUNT_INVARIANT_FAILED");
        }
        // No session for the new account (the administrator's own session is never touched) and nothing financial
        // (a manual access grant is not a subscription, plan or payment).
        if (await tx.session.count({ where: { userId: user.id } }) !== 0) throw new Error("UNEXPECTED_SESSION");
        if (await tx.subscription.count({ where: { userId: user.id } }) !== 0) throw new Error("UNEXPECTED_SUBSCRIPTION");

        const created = await tx.user.update({
          where: { id: user.id },
          data: { mustChangePassword: true, ...(role === "ADMIN" ? { role } : {}) },
          select: ADMIN_USER_ROW_SELECT,
        });
        await tx.adminAuditEvent.create({
          data: { action: "USER_CREATED", actorId: actor.user.id, targetUserId: user.id, newRole: role }, select: { id: true },
        });
        // Same transaction: if the grant or its audit event fails, the account is not created either.
        const grant = period ? await insertGrant(tx, { actorId: actor.user.id, userId: user.id, ...period }) : null;
        // Informational only: an approved payment with the same e-mail does not prove who paid. Nothing is linked.
        const priorApprovedPayments = await tx.payment.count({
          where: { email: { equals: data.email, mode: "insensitive" }, status: "approved" },
        });
        return { user: toAdminUserRow({ ...created, manualAccessGrant: grant }, at), priorApprovedPayments };
      }, { maxWait: 5000, timeout: 15000 });
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === "P2002") throw new UserManagementError(409, "EMAIL_ALREADY_REGISTERED");
      throw error;
    }
  }

  /** Promote STUDENT -> ADMIN or demote a non-principal ADMIN -> STUDENT. Principal administrators only. */
  async function changeRole(id: unknown, input: unknown) {
    const actor = await guards.requirePrincipalAdmin();
    const data = parseChangeRole(id, input);
    if (data.id === actor.user.id) throw new UserManagementError(403, "PROTECTED_ACCOUNT");
    const role = toRole(data.role);
    return db.$transaction(async tx => {
      await lockAndCheckActor(tx, actor.user.id, true);
      const target = await tx.user.findUnique({
        where: { id: data.id }, select: { id: true, role: true, isPrincipalAdmin: true, disabledAt: true },
      });
      if (!target) throw new UserManagementError(404, "USER_NOT_FOUND");
      if (target.isPrincipalAdmin) throw new UserManagementError(403, "PROTECTED_ACCOUNT");
      if (target.role === role) throw new UserManagementError(409, "ROLE_UNCHANGED");
      if (role === "ADMIN" && target.disabledAt !== null) throw new UserManagementError(422, "USER_DISABLED");
      // Optimistic concurrency: the row must still be exactly what the administrator saw.
      const changed = await tx.user.updateMany({
        where: { id: target.id, role: target.role, isPrincipalAdmin: false, updatedAt: data.expectedUpdatedAt },
        data: { role },
      });
      if (changed.count !== 1) throw new UserManagementError(409, "USER_CONFLICT");
      await tx.adminAuditEvent.create({
        data: { action: "ROLE_CHANGED", actorId: actor.user.id, targetUserId: target.id, previousRole: target.role, newRole: role },
        select: { id: true },
      });
      const updated = await tx.user.findUniqueOrThrow({ where: { id: target.id }, select: ADMIN_USER_ROW_SELECT });
      return { user: toAdminUserRow(updated) };
    }, { maxWait: 5000, timeout: 15000 });
  }

  return { create, changeRole };
}
