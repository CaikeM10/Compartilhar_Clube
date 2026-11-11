import { getMaterials } from "@/lib/materials/server";
import { materialResponse, mutationBody } from "@/lib/materials/http";
import { readAuthEnvironment } from "@/lib/auth/config";
import { requireAdmin } from "@/lib/auth/authorization";
import { revalidateMaterialPages } from "@/lib/materials/revalidate";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return materialResponse(async () => {
    await requireAdmin();
    return getMaterials().getAdmin((await context.params).id);
  });
}
export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return materialResponse(async () => {
    await requireAdmin();
    const body = await mutationBody(request, readAuthEnvironment(process.env).baseURL);
    const changed = await getMaterials().change((await context.params).id, body);
    revalidateMaterialPages();
    return changed;
  });
}
