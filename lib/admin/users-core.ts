import "server-only";
import type { PrismaClient, Role } from "@prisma/client";
import {
  toManualAccessView, toPaidAccessView, type ManualAccessView, type PaidAccessView,
} from "./manual-access-rules";

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string;
  role: "admin" | "student";
  createdAt: string;
  updatedAt: string;
  disabled: boolean;
  principal: boolean;
  mustChangePassword: boolean;
  /** Two independent sources of content access, shown separately: paid subscription and administrative grant. */
  paidAccess: PaidAccessView;
  manualAccess: ManualAccessView;
};

export type AdminUsers =
  | { kind: "unavailable" }
  | { kind: "ready"; users: AdminUserRow[] };

/** Whitelisted columns only: never credentials, sessions or audit data. */
export const ADMIN_USER_ROW_SELECT = {
  id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true, disabledAt: true,
  isPrincipalAdmin: true, mustChangePassword: true,
} as const;

/** Paid subscriptions still running (dates and count only: no plan, price or payment data). */
export function paidAccessSelect(at: Date) {
  return {
    subscriptions: { where: { status: "active", endDate: { gt: at } }, select: { startDate: true, endDate: true } },
    _count: { select: { subscriptions: true } },
  } as const;
}

/** Grant period and concurrency token only: never who granted or revoked it. */
export const MANUAL_ACCESS_ROW_SELECT = {
  manualAccessGrant: { select: { startsAt: true, endsAt: true, revokedAt: true, updatedAt: true } },
} as const;

type AdminUserRecord = {
  id: string; name: string | null; email: string; role: Role; createdAt: Date; updatedAt: Date; disabledAt: Date | null;
  isPrincipalAdmin: boolean; mustChangePassword: boolean;
  manualAccessGrant?: { startsAt: Date; endsAt: Date; revokedAt: Date | null; updatedAt: Date } | null;
  subscriptions?: { startDate: Date; endDate: Date }[];
  _count?: { subscriptions: number };
};

export function toAdminUserRow(row: AdminUserRecord, at: Date = new Date()): AdminUserRow {
  const name = row.name?.trim();
  return {
    id: row.id,
    name: name ? name : null,
    email: row.email,
    role: row.role === "ADMIN" ? "admin" : "student",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    disabled: row.disabledAt !== null,
    principal: row.isPrincipalAdmin === true,
    mustChangePassword: row.mustChangePassword === true,
    paidAccess: toPaidAccessView(row.subscriptions ?? [], row._count?.subscriptions ?? 0, at),
    manualAccess: toManualAccessView(row.manualAccessGrant ?? null, at),
  };
}

/** Read-only user listing for administrators. Whitelisted fields only: no credentials or sessions. */
export function createAdminUsersReader(
  db: PrismaClient,
  requireAdmin: () => Promise<unknown>,
  now: () => Date = () => new Date(),
) {
  return async function read(): Promise<AdminUsers> {
    // Authorization errors propagate; they must never become an empty list.
    await requireAdmin();
    const at = now();
    try {
      const rows = await db.user.findMany({
        select: { ...ADMIN_USER_ROW_SELECT, ...MANUAL_ACCESS_ROW_SELECT, ...paidAccessSelect(at) },
        orderBy: { createdAt: "desc" },
      });
      return { kind: "ready", users: rows.map(row => toAdminUserRow(row, at)) };
    } catch {
      return { kind: "unavailable" };
    }
  };
}
