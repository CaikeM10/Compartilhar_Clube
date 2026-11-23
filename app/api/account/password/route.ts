import { getPasswordChange } from "@/lib/account/password";
import { mutationBody, usersResponse } from "@/lib/admin/users-http";
import { readAuthEnvironment } from "@/lib/auth/config";
import { requirePasswordChangeSession } from "@/lib/auth/authorization";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return usersResponse(async () => {
    await requirePasswordChangeSession();
    const body = await mutationBody(request, readAuthEnvironment(process.env).baseURL);
    return getPasswordChange()(body, request.headers);
  }, 200, "ACCOUNT_UNAVAILABLE");
}
