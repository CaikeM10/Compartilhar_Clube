import "server-only";
import { getAuthInfrastructure } from "@/lib/auth/server";
import { requireAdmin } from "@/lib/auth/authorization";
import { createAdminUsersReader } from "./users-core";

export async function getAdminUsers() {
  return createAdminUsersReader(getAuthInfrastructure().db, requireAdmin)();
}
