import "server-only";
import { headers } from "next/headers";
import { createAuthorization } from "./authorization-core";
import { getAuthInfrastructure } from "./server";

export { AuthorizationError } from "./authorization-core";

function authorization() {
  const { auth, db } = getAuthInfrastructure();
  return createAuthorization(auth, db, async () => new Headers(await headers()));
}

export async function requireSession() { return authorization().requireSession(); }
export async function requireAdmin() { return authorization().requireAdmin(); }
export async function requireActiveSubscription() { return authorization().requireActiveSubscription(); }
