import "server-only";
import { getAuthInfrastructure } from "@/lib/auth/server";
import { requirePasswordChangeSession } from "@/lib/auth/authorization";
import { createPasswordChangeService } from "./password-core";

export function getPasswordChange() {
  const { auth, db } = getAuthInfrastructure();
  return createPasswordChangeService(db, requirePasswordChangeSession, auth);
}
