import "server-only";
import type { ServerAuth } from "./config";
import { toNextJsHandler } from "better-auth/next-js";

/** Never send adapter errors, schema diagnostics or user records in an error response. */
export async function handleAuthRequest(request: Request, getAuth: () => ServerAuth) {
  try {
    const handlers = toNextJsHandler(getAuth());
    const response = await (request.method === "GET" ? handlers.GET(request) : handlers.POST(request));
    if (response.status >= 500) return unavailable();
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return unavailable();
  }
}

function unavailable() {
  return Response.json({ error: "AUTH_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
