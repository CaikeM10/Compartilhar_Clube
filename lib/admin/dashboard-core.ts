import "server-only";
import type { PrismaClient } from "@prisma/client";

export type AdminDashboard =
  | { kind: "unavailable" }
  | { kind: "ready"; students: number; activeSubscriptions: number;
      expiringSubscriptions: number; lessons: number; publishedLessons: number; checkedAt: string };

/** Aggregates only: no user records, payment details or shared result cache. */
export function createAdminDashboardReader(
  db: PrismaClient,
  requireAdmin: () => Promise<unknown>,
  now = () => new Date(),
) {
  return async function read(): Promise<AdminDashboard> {
    // Authorization errors propagate; they must never become an empty dashboard.
    await requireAdmin();
    const at = now();
    const until = new Date(at.getTime() + 7 * 24 * 60 * 60 * 1000);
    const active = { status: "active", startDate: { lte: at }, endDate: { gt: at } };
    try {
      const [students, activeSubscriptions, expiringSubscriptions, lessons, publishedLessons] =
        await db.$transaction([
          db.user.count({ where: { role: "STUDENT" } }),
          db.subscription.count({ where: active }),
          db.subscription.count({ where: { ...active, endDate: { gt: at, lte: until } } }),
          db.lesson.count(),
          db.lesson.count({ where: { status: "PUBLISHED" } }),
        ], { isolationLevel: "RepeatableRead" });
      return { kind: "ready", students, activeSubscriptions, expiringSubscriptions,
        lessons, publishedLessons, checkedAt: at.toISOString() };
    } catch {
      return { kind: "unavailable" };
    }
  };
}
