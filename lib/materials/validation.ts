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
