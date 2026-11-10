import "server-only";
import type { PrismaClient } from "@prisma/client";
import type { ServerAuth } from "./config";

export class AuthorizationError extends Error {
  constructor(public readonly status: 401 | 403, public readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "SUBSCRIPTION_REQUIRED") {
    super(code);
    this.name = "AuthorizationError";
  }
}

export function createAuthorization(
  auth: ServerAuth,
  db: PrismaClient,
  requestHeaders: () => Promise<Headers>,
  now: () => Date = () => new Date(),
) {
  async function requireSession() {
    let session;
    try {
      session = await auth.api.getSession({ headers: await requestHeaders(), query: { disableCookieCache: true } });
    } catch (error) {
      // Only map expected auth failures. Infrastructure errors must fail closed,
      // not masquerade as a signed-out user or return database diagnostics.
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 401 || status === 403) throw new AuthorizationError(status, status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN");
      throw error;
    }
    if (!session || new Date(session.session.expiresAt) <= now()) throw new AuthorizationError(401, "UNAUTHENTICATED");
    // Fresh database state, not browser fields, cached role or an email heuristic.
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, role: true, disabledAt: true, emailVerified: true, createdAt: true },
    });
    if (!user) throw new AuthorizationError(401, "UNAUTHENTICATED");
    if (user.disabledAt !== null) throw new AuthorizationError(403, "FORBIDDEN");
    // Intentionally omit token, password, account records and internal block timestamp.
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified, createdAt: user.createdAt },
      session: { id: session.session.id, expiresAt: session.session.expiresAt },
    };
  }

  async function requireAdmin() {
    const account = await requireSession();
    if (account.user.role !== "ADMIN") throw new AuthorizationError(403, "FORBIDDEN");
    return account;
  }

  async function requireActiveSubscription() {
    const account = await requireSession();
    const at = now();
    const subscription = await db.subscription.findFirst({
      where: { userId: account.user.id, status: "active", startDate: { lte: at }, endDate: { gt: at } },
      orderBy: { endDate: "desc" },
      select: { id: true, planId: true, startDate: true, endDate: true },
    });
    if (!subscription) throw new AuthorizationError(403, "SUBSCRIPTION_REQUIRED");
    return { ...account, subscription };
  }

  return { requireSession, requireAdmin, requireActiveSubscription };
}
