import "server-only";
import type { PrismaClient } from "@prisma/client";

type SessionReader = () => Promise<{ user: { id: string } }>;
export type StudentSubscription =
  | { kind: "none" | "unavailable" }
  | { kind: "subscription"; plan: string; status: "active" | "scheduled" | "expired" | "inactive";
      startsAt: string; expiresAt: string };

/** Identity always comes from the server session, never a URL, form or caller ID. */
export function createStudentSubscriptionReader(db: PrismaClient, requireSession: SessionReader, now = () => new Date()) {
  return async function read(): Promise<StudentSubscription> {
    // Authentication failures must propagate; they are not a missing subscription.
    const { user } = await requireSession();
    const at = now();
    const select = { status: true, startDate: true, endDate: true, plan: { select: { name: true } } } as const;
    try {
      const active = await db.subscription.findFirst({
        where: { userId: user.id, status: "active", startDate: { lte: at }, endDate: { gt: at } },
        orderBy: [{ endDate: "desc" }, { id: "asc" }], select,
      });
      const subscription = active ?? await db.subscription.findFirst({
        where: { userId: user.id }, orderBy: [{ endDate: "desc" }, { id: "asc" }], select,
      });
      if (!subscription) return { kind: "none" };
      const status = subscription.status !== "active" ? "inactive"
        : subscription.endDate <= at ? "expired"
        : subscription.startDate > at ? "scheduled" : "active";
      const names: Record<string, string> = { mensal: "Plano mensal", trimestral: "Plano trimestral", anual: "Plano anual" };
      const name = subscription.plan.name;
      return { kind: "subscription", plan: name.startsWith("LOCAL_STUDENT_TEST_30D_")
        ? "Plano de teste local — 30 dias" : Object.hasOwn(names, name) ? names[name] : name,
      status, startsAt: subscription.startDate.toISOString(), expiresAt: subscription.endDate.toISOString() };
    } catch {
      // No raw driver errors, account IDs or connection strings reach the page.
      return { kind: "unavailable" };
    }
  };
}
