import { z } from "zod";

const checkout = z.string().max(2048).refine(value => {
  if (value === "") return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "go.hotmart.com" && !url.username && !url.password && !url.port;
  } catch { return false; }
});
export const materialInput = z.object({
  title: z.string().min(1).max(300).refine(value => value.trim().length > 0),
  description: z.string().max(10000).nullable(),
  priceCents: z.number().int().min(0).max(2147483647),
  currency: z.literal("BRL"),
  coverImage: z.string().max(2048).regex(/^\/(?!\/)(?!.*\.\.)(?!.*[\\?#])[\p{L}\p{N}_/ .-]+\.(?:webp|png|jpg|jpeg)$/u),
  checkoutUrl: checkout.nullable(),
  isPremium: z.boolean(),
  displayOrder: z.number().int().min(0).max(2147483647),
}).strict();
export const materialChange = z.object({
  expectedUpdatedAt: z.string().datetime(),
  data: materialInput.partial().extend({ status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional() })
    .strict().refine(value => Object.keys(value).length > 0),
}).strict();

/** Route/body identifiers: seed IDs (material-initial-001) and cuid. */
export const materialId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/** Full desired order of every non-archived material; position in the array becomes displayOrder. */
export const materialOrder = z.object({
  order: z.array(materialId).min(1).max(1000).refine(ids => new Set(ids).size === ids.length),
}).strict();

export const PDF_MAX_BYTES = 25 * 1024 * 1024;
const pdfFilename = z.string().min(5).max(255)
  // No path separators, control characters or reserved characters; must end in .pdf.
  .regex(/^(?!\.)[^\\/:*?"<>|\u0000-\u001f\u007f]+\.pdf$/i)
  .refine(value => value.trim() === value);

export const pdfAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    filename: pdfFilename,
    contentType: z.literal("application/pdf"),
    size: z.number().int().min(1).max(PDF_MAX_BYTES),
  }).strict(),
  z.object({ action: z.literal("confirm"), assetId: materialId }).strict(),
]);

export const pdfRemoval = z.object({ assetId: materialId }).strict();
