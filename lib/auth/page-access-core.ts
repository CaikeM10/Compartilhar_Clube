import "server-only";
import { AuthorizationError, type createAuthorization } from "./authorization-core";

export type PageAccess = "account" | "admin" | "subscriber";

export function createPageAccess(
  authorization: ReturnType<typeof createAuthorization>,
  redirect: (destination: string) => never,
) {
  return async function requirePageAccess(access: PageAccess) {
    let destination: string;
    try {
      if (access === "admin") return await authorization.requireAdmin();
      if (access === "subscriber") return await authorization.requireActiveSubscription();
      return await authorization.requireSession();
    } catch (error) {
      if (!(error instanceof AuthorizationError)) throw new Error("AUTH_UNAVAILABLE");
      if (error.status === 401) destination = "/login";
      else if (error.code === "SUBSCRIPTION_REQUIRED") destination = "/aluno/dashboard?access=subscription-required";
      else destination = "/login?reason=access-denied";
    }
    // Keep Next's redirect exception outside the auth error boundary. Destinations
    // are fixed server constants; no client returnTo or role is trusted.
    redirect(destination);
  };
}
