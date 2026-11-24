import "server-only";
import type { PrismaClient } from "@prisma/client";
import { parseChangePassword, PASSWORD_MIN, UserManagementError } from "@/lib/admin/user-validation";

type Account = { user: { id: string; role: "ADMIN" | "STUDENT" } };
/** Better Auth's own change-password endpoint (verifies the current password, hashes with scrypt). */
export type PasswordChangeAuth = {
  api: {
    changePassword: (context: {
      headers: Headers;
      body: { currentPassword: string; newPassword: string; revokeOtherSessions: boolean };
    }) => Promise<unknown>;
  };
};

/**
 * Changes the signed-in account's own password through Better Auth and only then clears the pending flag.
 * Allowed while a change is pending (requirePasswordChangeSession). Every other session of the account is revoked;
 * Better Auth issues a fresh session cookie for this browser. Passwords never leave this function.
 */
export function createPasswordChangeService(
  db: PrismaClient,
  requirePasswordChangeSession: () => Promise<Account>,
  auth: PasswordChangeAuth,
) {
  return async function change(input: unknown, headers: Headers) {
    const account = await requirePasswordChangeSession();
    const data = parseChangePassword(input, account.user.role === "ADMIN" ? PASSWORD_MIN.admin : PASSWORD_MIN.student);
    try {
      await auth.api.changePassword({
        headers, body: { currentPassword: data.currentPassword, newPassword: data.newPassword, revokeOtherSessions: true },
      });
    } catch (error) {
      const status = (error as { statusCode?: unknown } | null)?.statusCode;
      if (status === 400 || status === 401) throw new UserManagementError(400, "INVALID_CURRENT_PASSWORD");
      throw error;
    }
    // If this write fails the password is already changed and the flag stays on: the account changes it again.
    await db.user.updateMany({ where: { id: account.user.id }, data: { mustChangePassword: false } });
    return { destination: account.user.role === "ADMIN" ? "/admin/dashboard" : "/aluno/dashboard" };
  };
}
