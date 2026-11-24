import { getManualAccess } from "@/lib/admin/manual-access";
import { mutationBody, usersResponse } from "@/lib/admin/users-http";
import { readAuthEnvironment } from "@/lib/auth/config";
import { requireAdmin } from "@/lib/auth/authorization";
import { revalidatePath } from "next/cache";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Grant, renew or revoke manual access: { action: "grant" | "renew" | "revoke", ... } (lib/admin/user-validation.ts). */
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return usersResponse(async () => {
    await requireAdmin();
    const body = await mutationBody(request, readAuthEnvironment(process.env).baseURL);
    const changed = await getManualAccess().change((await context.params).id, body);
    revalidatePath("/admin/usuarios");
    revalidatePath("/admin/dashboard");
    return changed;
  });
}
