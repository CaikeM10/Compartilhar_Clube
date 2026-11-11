import { getMaterials } from "@/lib/materials/server";
import { materialResponse, mutationBody } from "@/lib/materials/http";
import { readAuthEnvironment } from "@/lib/auth/config";
import { requireAdmin } from "@/lib/auth/authorization";
import { revalidateMaterialPages } from "@/lib/materials/revalidate";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The PDF itself never passes through this route: "start" returns a signed upload URL, "confirm" validates the stored object.
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return materialResponse(async () => {
    await requireAdmin();
    const body = await mutationBody(request, readAuthEnvironment(process.env).baseURL);
    const result = await getMaterials().pdf((await context.params).id, body);
    revalidateMaterialPages();
    return result;
  });
}
export function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return materialResponse(async () => {
    await requireAdmin();
    const body = await mutationBody(request, readAuthEnvironment(process.env).baseURL);
    const removed = await getMaterials().removePdf((await context.params).id, body);
    revalidateMaterialPages();
    return removed;
  });
}
