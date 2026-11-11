import "server-only";
import { AuthorizationError } from "@/lib/auth/authorization-core";
import { LessonError } from "@/lib/lessons/service-core";
import { StorageError } from "@/lib/storage/private-storage";
import { MaterialError } from "./service-core";

// Reuses the hardened JSON reader from lessons (Origin check, JSON only, 64 KB cap). Its errors are LessonError.
export { mutationBody } from "@/lib/lessons/http";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

function failure(error: unknown) {
  const known = error instanceof AuthorizationError || error instanceof MaterialError || error instanceof StorageError || error instanceof LessonError;
  return Response.json({ error: known ? error.code : "MATERIALS_UNAVAILABLE" }, { status: known ? error.status : 503, headers });
}

export async function materialResponse(operation: () => Promise<unknown>, success = 200) {
  try { return Response.json(await operation(), { status: success, headers }); }
  catch (error) { return failure(error); }
}

/** Redirects to a short-lived signed URL. The URL is never persisted, cached or returned as JSON. */
export async function materialRedirect(operation: () => Promise<string>) {
  try {
    const location = await operation();
    return new Response(null, { status: 302, headers: { ...headers, Location: location, "Referrer-Policy": "no-referrer" } });
  } catch (error) { return failure(error); }
}
