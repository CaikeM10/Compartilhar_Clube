import { getLessons } from "@/lib/lessons/server";
import { lessonResponse, mutationBody } from "@/lib/lessons/http";
import { readAuthEnvironment } from "@/lib/auth/config";
import { requireAdmin } from "@/lib/auth/authorization";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() { return lessonResponse(() => getLessons().listAdmin()); }
export function POST(request: Request) {
  return lessonResponse(async () => {
    await requireAdmin();
    const body = await mutationBody(request, readAuthEnvironment(process.env).baseURL);
    return getLessons().create(body);
  }, 201);
}
