import { getMaterials } from "@/lib/materials/server";
import { materialResponse, mutationBody } from "@/lib/materials/http";
import { readAuthEnvironment } from "@/lib/auth/config";
import { requireAdmin } from "@/lib/auth/authorization";
import { revalidateMaterialPages } from "@/lib/materials/revalidate";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return materialResponse(async () => { await requireAdmin(); return getMaterials().listAdmin(); });
}
export function POST(request: Request) {
  return materialResponse(async () => {
    await requireAdmin();
    const body = await mutationBody(request, readAuthEnvironment(process.env).baseURL);
    const created = await getMaterials().create(body);
    revalidateMaterialPages();
    return created;
  }, 201);
}
