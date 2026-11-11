import { getMaterials } from "@/lib/materials/server";
import { materialResponse, mutationBody } from "@/lib/materials/http";
import { readAuthEnvironment } from "@/lib/auth/config";
import { requireAdmin } from "@/lib/auth/authorization";
import { revalidateMaterialPages } from "@/lib/materials/revalidate";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function PUT(request: Request) {
  return materialResponse(async () => {
    await requireAdmin();
    const body = await mutationBody(request, readAuthEnvironment(process.env).baseURL);
    const order = await getMaterials().reorder(body);
    revalidateMaterialPages();
    return order;
  });
}
