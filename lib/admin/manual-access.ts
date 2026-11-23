import "server-only";
import { getAuthInfrastructure } from "@/lib/auth/server";
import { requireAdmin } from "@/lib/auth/authorization";
import { createManualAccessService } from "./manual-access-core";

export function getManualAccess() {
  return createManualAccessService(getAuthInfrastructure().db, { requireAdmin });
}
