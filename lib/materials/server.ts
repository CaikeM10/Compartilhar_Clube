import "server-only";
import { getAuthInfrastructure } from "@/lib/auth/server";
import { requireAdmin } from "@/lib/auth/authorization";
import { createMaterialService, MaterialError } from "./service-core";

/**
 * Explicit opt-in per environment (set only by the isolated local launcher for now).
 * Any other value fails closed before a client is touched or a query is issued.
 */
export function assertMaterialsEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.MATERIALS_PERSISTENCE !== "enabled") throw new MaterialError(503, "MATERIALS_PERSISTENCE_DISABLED");
}

// Same shape as getLessons(): shared pool, ADMIN guard runs first inside every service method.
export function getMaterials() {
  assertMaterialsEnabled();
  return createMaterialService(getAuthInfrastructure().db, requireAdmin);
}
