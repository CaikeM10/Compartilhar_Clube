import "server-only";
import { AuthorizationError } from "@/lib/auth/authorization-core";
import { LessonError } from "@/lib/lessons/service-core";
import { UserManagementError } from "./user-validation";

// Reuses the hardened JSON reader from lessons (Origin check, JSON only, 64 KB cap). Its errors are LessonError.
export { mutationBody } from "@/lib/lessons/http";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

/** Fixed error codes only: never driver messages, e-mails, passwords or hashes. Unknown failures are 503. */
export async function usersResponse(operation: () => Promise<unknown>, success = 200, unavailable = "USERS_UNAVAILABLE") {
  try { return Response.json(await operation(), { status: success, headers }); }
  catch (error) {
    const known = error instanceof AuthorizationError || error instanceof UserManagementError || error instanceof LessonError;
    return Response.json({ error: known ? error.code : unavailable }, { status: known ? error.status : 503, headers });
  }
}
