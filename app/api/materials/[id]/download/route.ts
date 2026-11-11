import { getMaterials } from "@/lib/materials/server";
import { materialRedirect } from "@/lib/materials/http";
import { requireActiveSubscription } from "@/lib/auth/authorization";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Session + active subscription are checked here and again inside the service before any URL is signed.
export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return materialRedirect(async () => {
    await requireActiveSubscription();
    return getMaterials().download((await context.params).id);
  });
}
