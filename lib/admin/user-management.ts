import "server-only";
import { getAuthInfrastructure } from "@/lib/auth/server";
import { requireAdmin, requirePrincipalAdmin } from "@/lib/auth/authorization";
import { createServerAuth, readAuthEnvironment } from "@/lib/auth/config";
import { createUserManagementService } from "./user-management-core";

export function getUserManagement() {
  const environment = readAuthEnvironment(process.env);
  return createUserManagementService(
    getAuthInfrastructure().db,
    { requireAdmin, requirePrincipalAdmin },
    // In-process instance bound to the transaction: no automatic sign-in, no cookies, never mounted on a route.
    tx => createServerAuth(tx, { ...environment, serverProvisioning: true }),
  );
}
