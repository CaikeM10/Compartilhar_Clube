import "server-only";
import { getAuthInfrastructure } from "@/lib/auth/server";
import { requireAdmin, requireActiveSubscription } from "@/lib/auth/authorization";
import { createLessonService } from "./service-core";
export function getLessons() {
  return createLessonService(getAuthInfrastructure().db, { requireAdmin, requireActiveSubscription });
}
