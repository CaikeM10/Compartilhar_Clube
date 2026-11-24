import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { AuthorizationError } from "@/lib/auth/authorization-core";
import { grantPeriod, manualAccessStatus, renewalEnd, toManualAccessView, toPaidAccessView } from "./manual-access-rules";
import { parseAccessAction, UserManagementError } from "./user-validation";
import { paidAccessSelect } from "./users-core";

/** Serializes manual access changes (the unique userId index is the final guard against duplicate grants). */
export const MANUAL_ACCESS_LOCK = 61420323;

type Actor = { user: { id: string } };
export type ManualAccessGuards = { requireAdmin: () => Promise<Actor> };
type Tx = Prisma.TransactionClient;

export const GRANT_SELECT = { id: true, startsAt: true, endsAt: true, revokedAt: true, updatedAt: true } as const;

/**
 * The acting administrator, read again inside the transaction: a role removed, an account disabled or a pending
 * password change since the session check is honoured. Any ADMIN (principal or common) may manage manual access.
 */
export async function assertActiveAdmin(tx: Tx, actorId: string) {
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, disabledAt: true, mustChangePassword: true } });
  if (!actor || actor.role !== "ADMIN" || actor.disabledAt !== null || actor.mustChangePassword === true) {
    throw new AuthorizationError(403, "FORBIDDEN");
  }
}

/**
 * Inside the caller's transaction: first grant row of a student plus its GRANTED event. Used by the panel account
 * creation (brand-new student) and by `grant` below. Never touches plans, subscriptions or payments.
 */
export async function insertGrant(tx: Tx, input: { actorId: string; userId: string; startsAt: Date; endsAt: Date }) {
  const grant = await tx.manualAccessGrant.create({
    data: { userId: input.userId, startsAt: input.startsAt, endsAt: input.endsAt, grantedById: input.actorId }, select: GRANT_SELECT,
  });
  await tx.manualAccessEvent.create({
    data: { action: "GRANTED", grantId: grant.id, actorId: input.actorId, targetUserId: input.userId, newStartsAt: input.startsAt, newEndsAt: input.endsAt },
    select: { id: true },
  });
  return grant;
}

const sameInstant = (a: Date, b: Date) => a.getTime() === b.getTime();

/**
 * Grant, renew and revoke manual access for students. The guard is the first statement; the request only carries the
 * student id, the calendar days and the optimistic-concurrency token the administrator saw. Paid subscriptions are
 * only read (to warn the administrator) and are never created, changed or cancelled here.
 */
export function createManualAccessService(db: PrismaClient, guards: ManualAccessGuards, now: () => Date = () => new Date()) {
  async function change(id: unknown, input: unknown) {
    const actor = await guards.requireAdmin();
    const { id: userId, change: request } = parseAccessAction(id, input);
    // Administrators are never targets (only students are), so their own account is refused up front.
    if (userId === actor.user.id) throw new UserManagementError(403, "PROTECTED_ACCOUNT");
    try {
      return await db.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${MANUAL_ACCESS_LOCK})`);
        await assertActiveAdmin(tx, actor.user.id);
        const at = now();
        const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true, disabledAt: true } });
        if (!target) throw new UserManagementError(404, "USER_NOT_FOUND");
        const grant = await tx.manualAccessGrant.findUnique({ where: { userId }, select: GRANT_SELECT });
        const status = manualAccessStatus(grant, at);
        const live = status === "active" || status === "scheduled";
        // Revoking is always allowed; giving access requires an enabled STUDENT (the database trigger agrees).
        if (request.action !== "revoke") {
          if (target.role !== "STUDENT") throw new UserManagementError(422, "ACCESS_TARGET_NOT_STUDENT");
          if (target.disabledAt !== null) throw new UserManagementError(422, "USER_DISABLED");
        }

        if (request.action === "grant") {
          if (live) throw new UserManagementError(409, "ACCESS_ALREADY_ACTIVE");
          // The token must be exactly what the administrator saw: null when no grant existed yet.
          if (grant === null ? request.expectedUpdatedAt !== null
            : request.expectedUpdatedAt === null || !sameInstant(grant.updatedAt, request.expectedUpdatedAt)) {
            throw new UserManagementError(409, "ACCESS_CONFLICT");
          }
          const period = grantPeriod(request.startDate, request.endDate, at);
          if (!period) throw new UserManagementError(400, "INVALID_ACCESS_PERIOD");
          if (grant === null) {
            await insertGrant(tx, { actorId: actor.user.id, userId, ...period });
          } else {
            // An expired or revoked row is reused (one row per student); the previous period stays in the event.
            const changed = await tx.manualAccessGrant.updateMany({
              where: { id: grant.id, updatedAt: grant.updatedAt },
              data: { ...period, revokedAt: null, revokedById: null, grantedById: actor.user.id },
            });
            if (changed.count !== 1) throw new UserManagementError(409, "ACCESS_CONFLICT");
            await tx.manualAccessEvent.create({
              data: { action: "GRANTED", grantId: grant.id, actorId: actor.user.id, targetUserId: userId,
                previousStartsAt: grant.startsAt, previousEndsAt: grant.endsAt, newStartsAt: period.startsAt, newEndsAt: period.endsAt },
              select: { id: true },
            });
          }
        } else {
          if (grant === null || !live) throw new UserManagementError(409, "ACCESS_NOT_ACTIVE");
          if (!sameInstant(grant.updatedAt, request.expectedUpdatedAt)) throw new UserManagementError(409, "ACCESS_CONFLICT");
          if (request.action === "renew") {
            const renewal = renewalEnd(request.endDate, grant, at);
            if (!renewal) throw new UserManagementError(400, "INVALID_ACCESS_PERIOD");
            const changed = await tx.manualAccessGrant.updateMany({
              where: { id: grant.id, updatedAt: grant.updatedAt, revokedAt: null }, data: { endsAt: renewal.endsAt },
            });
            if (changed.count !== 1) throw new UserManagementError(409, "ACCESS_CONFLICT");
            await tx.manualAccessEvent.create({
              data: { action: "RENEWED", grantId: grant.id, actorId: actor.user.id, targetUserId: userId,
                previousStartsAt: grant.startsAt, previousEndsAt: grant.endsAt, newStartsAt: grant.startsAt, newEndsAt: renewal.endsAt },
              select: { id: true },
            });
          } else {
            // Logical revocation: effective on the next access check. Paid subscriptions are not affected.
            const changed = await tx.manualAccessGrant.updateMany({
              where: { id: grant.id, updatedAt: grant.updatedAt, revokedAt: null }, data: { revokedAt: at, revokedById: actor.user.id },
            });
            if (changed.count !== 1) throw new UserManagementError(409, "ACCESS_CONFLICT");
            await tx.manualAccessEvent.create({
              data: { action: "REVOKED", grantId: grant.id, actorId: actor.user.id, targetUserId: userId,
                previousStartsAt: grant.startsAt, previousEndsAt: grant.endsAt },
              select: { id: true },
            });
          }
        }

        const current = await tx.manualAccessGrant.findUniqueOrThrow({ where: { userId }, select: GRANT_SELECT });
        const paid = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: paidAccessSelect(at) });
        return {
          access: toManualAccessView(current, at),
          // Informational only: shown as a warning; the two sources of access stay independent.
          paidAccess: toPaidAccessView(paid.subscriptions, paid._count.subscriptions, at),
        };
      }, { maxWait: 5000, timeout: 15000 });
    } catch (error) {
      // Concurrent first grants for the same student: the unique index decides, the loser sees a conflict.
      if ((error as { code?: unknown } | null)?.code === "P2002") throw new UserManagementError(409, "ACCESS_CONFLICT");
      throw error;
    }
  }

  return { change };
}
