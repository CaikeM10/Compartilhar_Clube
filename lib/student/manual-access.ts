import "server-only";
import { requireSession } from "@/lib/auth/authorization";
import { getAuthInfrastructure } from "@/lib/auth/server";
import { createStudentManualAccessReader } from "./manual-access-core";

export async function getStudentManualAccess() {
  return createStudentManualAccessReader(getAuthInfrastructure().db, requireSession)();
}
