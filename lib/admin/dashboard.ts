import "server-only";
import { getAuthInfrastructure } from "@/lib/auth/server";
import { requireAdmin } from "@/lib/auth/authorization";
import { createAdminDashboardReader } from "./dashboard-core";

export async function getAdminDashboard() {
  return createAdminDashboardReader(getAuthInfrastructure().db, requireAdmin)();
}
