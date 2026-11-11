import { requireSession } from "@/lib/auth/authorization";
import { handleAccountSession } from "@/lib/auth/account-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return handleAccountSession(requireSession);
}
