import "server-only";
import { AuthorizationError } from "@/lib/auth/authorization-core";
import { LessonError } from "@/lib/lessons/service-core";
import { StorageError } from "@/lib/storage/private-storage";
import { MaterialError } from "./service-core";
import { COVER_MAX_BYTES, isCoverContentType } from "./cover-image";

// Reuses the hardened JSON reader from lessons (Origin check, JSON only, 64 KB cap). Its errors are LessonError.
export { mutationBody } from "@/lib/lessons/http";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

function failure(error: unknown) {
  // Prisma unique-constraint violation (known request error P2002): a conflict, not an outage. No details are echoed.
  if ((error as { code?: unknown } | null)?.code === "P2002") {
    return Response.json({ error: "MATERIAL_CONFLICT" }, { status: 409, headers });
  }
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

/**
 * Raw image body for POST /api/admin/materials/covers. Same origin rule as mutationBody (Origin must equal
 * BETTER_AUTH_URL, cross-site refused); only the three cover types; streamed with a hard cap (never buffered past it).
 */
export async function coverUploadBody(request: Request, origin: string) {
  if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new MaterialError(403, "INVALID_ORIGIN");
  }
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!isCoverContentType(contentType)) throw new MaterialError(415, "COVER_TYPE_UNSUPPORTED");
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > COVER_MAX_BYTES) throw new MaterialError(413, "COVER_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new MaterialError(422, "COVER_INVALID");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > COVER_MAX_BYTES) { await reader.cancel(); throw new MaterialError(413, "COVER_TOO_LARGE"); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { bytes, contentType };
}

/**
 * Public, immutable cover response (content-addressed name: the bytes never change). Cached by browsers and by the
 * Vercel CDN (s-maxage). Errors are never cached. The image cannot run as a document (nosniff, CSP sandbox).
 */
export async function coverResponse(operation: () => Promise<{ body: ReadableStream<Uint8Array>; contentType: string; size: number }>) {
  try {
    const cover = await operation();
    return new Response(cover.body, {
      status: 200,
      headers: {
        "Content-Type": cover.contentType, "Content-Length": String(cover.size),
        "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
        "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) return failure(error);
    const known = error instanceof MaterialError || error instanceof StorageError;
    return Response.json({ error: known ? error.code : "COVER_UNAVAILABLE" }, { status: known ? error.status : 503, headers: { "Cache-Control": "no-store" } });
  }
}
