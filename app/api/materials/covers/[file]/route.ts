import { getMaterials } from "@/lib/materials/server";
import { coverResponse } from "@/lib/materials/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// PUBLIC BY DESIGN (like the storefront): cover images only. The service maps nothing but content-addressed cover names
// (<sha256>.png|jpg|webp) to keys under covers/, so private PDFs can never be served here.
export function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  return coverResponse(async () => getMaterials().readCover((await context.params).file));
}
