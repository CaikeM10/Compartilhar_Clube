import "server-only";
import { AuthorizationError } from "@/lib/auth/authorization-core";
import { LessonError } from "./service-core";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function lessonResponse(operation: () => Promise<unknown>, success = 200) {
  try { return Response.json(await operation(), { status: success, headers }); }
  catch (error) {
    const known = error instanceof AuthorizationError || error instanceof LessonError;
    return Response.json({ error: known ? error.code : "LESSONS_UNAVAILABLE" }, { status: known ? error.status : 503, headers });
  }
}
export async function mutationBody(request: Request, origin: string) {
  if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new LessonError(403, "INVALID_ORIGIN");
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new LessonError(415, "JSON_REQUIRED");
  const reader = request.body?.getReader();
  if (!reader) throw new LessonError(400, "INVALID_JSON");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 65536) { await reader.cancel(); throw new LessonError(413, "BODY_TOO_LARGE"); }
    chunks.push(part.value);
  }
  try {
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { throw new LessonError(400, "INVALID_JSON"); }
}
