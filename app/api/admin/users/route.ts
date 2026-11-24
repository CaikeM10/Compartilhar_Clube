import { getUserManagement } from "@/lib/admin/user-management";
import { mutationBody, usersResponse } from "@/lib/admin/users-http";
import { readAuthEnvironment } from "@/lib/auth/config";
import { requireAdmin } from "@/lib/auth/authorization";
import { revalidatePath } from "next/cache";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return usersResponse(async () => {
    await requireAdmin();
    const body = await mutationBody(request, readAuthEnvironment(process.env).baseURL);
    const created = await getUserManagement().create(body);
    revalidatePath("/admin/usuarios");
    return created;
  }, 201);
}
