import "server-only";
import type { PrismaClient } from "@prisma/client";

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string;
  role: "admin" | "student";
  createdAt: string;
  disabled: boolean;
};

export type AdminUsers =
  | { kind: "unavailable" }
  | { kind: "ready"; users: AdminUserRow[] };

/** Read-only user listing for administrators. Whitelisted fields only: no credentials or sessions. */
export function createAdminUsersReader(
  db: PrismaClient,
  requireAdmin: () => Promise<unknown>,
) {
  return async function read(): Promise<AdminUsers> {
    // Authorization errors propagate; they must never become an empty list.
    await requireAdmin();
    try {
      const rows = await db.user.findMany({
        select: { id: true, name: true, email: true, role: true, createdAt: true, disabledAt: true },
        orderBy: { createdAt: "desc" },
      });
      return {
        kind: "ready",
        users: rows.map((row) => {
          const name = row.name?.trim();
          return {
            id: row.id,
            name: name ? name : null,
            email: row.email,
            role: row.role === "ADMIN" ? "admin" : "student",
            createdAt: row.createdAt.toISOString(),
            disabled: row.disabledAt !== null,
          };
        }),
      };
    } catch {
      return { kind: "unavailable" };
    }
  };
}
