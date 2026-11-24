import { getMaterials } from "@/lib/materials/server";
import { coverUploadBody, materialResponse } from "@/lib/materials/http";
import { readAuthEnvironment } from "@/lib/auth/config";
import { requireAdmin } from "@/lib/auth/authorization";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Cover image upload: admin guard before the body is read; the service validates the bytes before storing anything.
// No page revalidation here: a new cover only becomes visible when a material is saved with it.
export function POST(request: Request) {
  return materialResponse(async () => {
    await requireAdmin();
    const { bytes, contentType } = await coverUploadBody(request, readAuthEnvironment(process.env).baseURL);
    return getMaterials().uploadCover(bytes, contentType);
  }, 201);
}
