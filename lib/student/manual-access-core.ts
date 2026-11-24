import "server-only";
import type { PrismaClient } from "@prisma/client";
import { fortalezaDay, lastDayOf, manualAccessStatus } from "@/lib/admin/manual-access-rules";

type SessionReader = () => Promise<{ user: { id: string } }>;
export type StudentManualAccess =
  | { kind: "none" }
  | { kind: "unavailable" }
  | { kind: "grant"; status: "active" | "scheduled" | "expired" | "revoked"; firstDay: string; lastDay: string };

/**
 * Display only (dashboard): the student's own administrative grant, read from the server session. Never the
 * administrator who granted it. The access decision itself is requireActiveSubscription() on every protected request.
 */
export function createStudentManualAccessReader(db: PrismaClient, requireSession: SessionReader, now = () => new Date()) {
  return async function read(): Promise<StudentManualAccess> {
    // Authentication failures must propagate; they are not a missing grant.
    const { user } = await requireSession();
    const at = now();
    try {
      const grant = await db.manualAccessGrant.findUnique({
        where: { userId: user.id }, select: { startsAt: true, endsAt: true, revokedAt: true },
      });
      const status = manualAccessStatus(grant, at);
      if (!grant || status === "none") return { kind: "none" };
      return { kind: "grant", status, firstDay: fortalezaDay(grant.startsAt), lastDay: lastDayOf(grant.endsAt) };
    } catch {
      // No raw driver errors reach the page (also covers a database where the grants table is not migrated yet).
      return { kind: "unavailable" };
    }
  };
}
