import { getUserManagement } from "@/lib/admin/user-management";
import { mutationBody, usersResponse } from "@/lib/admin/users-http";
import { readAuthEnvironment } from "@/lib/auth/config";
import { requirePrincipalAdmin } from "@/lib/auth/authorization";
import { revalidatePath } from "next/cache";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return usersResponse(async () => {
    await requirePrincipalAdmin();
    const body = await mutationBody(request, readAuthEnvironment(process.env).baseURL);
    const changed = await getUserManagement().changeRole((await context.params).id, body);
    revalidatePath("/admin/usuarios");
    return changed;
  });
}
