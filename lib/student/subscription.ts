import "server-only";
import { requireSession } from "@/lib/auth/authorization";
import { getAuthInfrastructure } from "@/lib/auth/server";
import { createStudentSubscriptionReader } from "./subscription-core";

export async function getStudentSubscription() {
  return createStudentSubscriptionReader(getAuthInfrastructure().db, requireSession)();
}
