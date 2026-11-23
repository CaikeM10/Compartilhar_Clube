import "server-only";
import { AuthorizationError, type createAuthorization } from "./authorization-core";

/** Only the authenticated account, never a userId/role supplied in the request. */
export async function handleAccountSession(
  requirePasswordChangeSession: ReturnType<typeof createAuthorization>["requirePasswordChangeSession"],
) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  try {
    // Login must succeed while an initial password is pending: the destination sends the account to the change page.
    const { user } = await requirePasswordChangeSession();
    return Response.json({
      user: {
        id: user.id, name: user.name ?? "", email: user.email,
        role: user.role === "ADMIN" ? "admin" : "student",
        createdAt: user.createdAt.toISOString(),
      },
      destination: user.mustChangePassword ? "/conta/alterar-senha" : user.role === "ADMIN" ? "/admin/dashboard" : "/aluno/dashboard",
    }, { headers });
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 503;
    return Response.json({ user: null, error: status === 503 ? "AUTH_UNAVAILABLE" : "UNAUTHENTICATED" }, { status, headers });
  }
}
