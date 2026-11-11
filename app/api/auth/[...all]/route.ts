import { getAuthInfrastructure } from "@/lib/auth/server";
import { handleAuthRequest } from "@/lib/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAuthRequest(request, () => getAuthInfrastructure().auth);
}

export async function POST(request: Request) {
  return handleAuthRequest(request, () => getAuthInfrastructure().auth);
}
