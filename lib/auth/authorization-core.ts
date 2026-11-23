import "server-only";
import type { PrismaClient } from "@prisma/client";
import type { ServerAuth } from "./config";

export type AuthorizationCode =
  | "UNAUTHENTICATED" | "FORBIDDEN" | "SUBSCRIPTION_REQUIRED" | "PASSWORD_CHANGE_REQUIRED" | "PRINCIPAL_ADMIN_REQUIRED";

export class AuthorizationError extends Error {
  constructor(public readonly status: 401 | 403, public readonly code: AuthorizationCode) {
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
  async function loadSession() {
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
      select: {
        id: true, name: true, email: true, role: true, disabledAt: true, emailVerified: true, createdAt: true,
        isPrincipalAdmin: true, mustChangePassword: true,
      },
    });
    if (!user) throw new AuthorizationError(401, "UNAUTHENTICATED");
    if (user.disabledAt !== null) throw new AuthorizationError(403, "FORBIDDEN");
    // Intentionally omit token, password, account records and internal block timestamp.
    return {
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified, createdAt: user.createdAt,
        // Strict comparison: only an explicit database `true` grants or requires anything.
        isPrincipalAdmin: user.isPrincipalAdmin === true, mustChangePassword: user.mustChangePassword === true,
      },
      session: { id: session.session.id, expiresAt: session.session.expiresAt },
    };
  }

  /** Every protected page and API: blocked while an initial password must still be changed. */
  async function requireSession() {
    const account = await loadSession();
    if (account.user.mustChangePassword) throw new AuthorizationError(403, "PASSWORD_CHANGE_REQUIRED");
    return account;
  }

  /** Only the account endpoint and the password-change page/route: allowed while a change is pending. */
  async function requirePasswordChangeSession() {
    return loadSession();
  }

  async function requireAdmin() {
    const account = await requireSession();
    if (account.user.role !== "ADMIN") throw new AuthorizationError(403, "FORBIDDEN");
    return account;
  }

  /** Principal administrators: an ADMIN designated by the operator procedure (never by the panel). */
  async function requirePrincipalAdmin() {
    const account = await requireAdmin();
    if (!account.user.isPrincipalAdmin) throw new AuthorizationError(403, "PRINCIPAL_ADMIN_REQUIRED");
    return account;
  }

  /**
   * Access to the exclusive contents. The historical name is kept for every existing caller (pages, lessons,
   * materials, download): it now means a current PAID subscription OR a valid MANUAL ACCESS GRANT.
   * - requireSession() runs first: disabled accounts and pending password changes stay blocked, grant or not.
   * - Paid subscription first (status "active", startDate <= now < endDate). Only without one is the grant read, so a
   *   grant problem can never block a paying student; a revoked or expired grant never affects the subscription.
   * - Grant: revokedAt IS NULL and startsAt <= now < endsAt. Expiry is automatic: every call compares dates.
   * - Admins receive no implicit access. Failure code stays SUBSCRIPTION_REQUIRED (pages redirect as before).
   */
  async function requireActiveSubscription() {
    const account = await requireSession();
    const at = now();
    const subscription = await db.subscription.findFirst({
      where: { userId: account.user.id, status: "active", startDate: { lte: at }, endDate: { gt: at } },
      orderBy: { endDate: "desc" },
      select: { id: true, planId: true, startDate: true, endDate: true },
    });
    if (subscription) return { ...account, subscription, access: { source: "subscription" as const, endsAt: subscription.endDate } };
    const grant = await db.manualAccessGrant.findFirst({
      where: { userId: account.user.id, revokedAt: null, startsAt: { lte: at }, endsAt: { gt: at } },
      select: { id: true, endsAt: true },
    });
    if (!grant) throw new AuthorizationError(403, "SUBSCRIPTION_REQUIRED");
    return { ...account, subscription: null, access: { source: "grant" as const, endsAt: grant.endsAt } };
  }

  return { requireSession, requirePasswordChangeSession, requireAdmin, requirePrincipalAdmin, requireActiveSubscription };
}
