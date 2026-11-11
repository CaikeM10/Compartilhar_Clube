import { z } from "zod";

/** No remote fetch, arbitrary iframe HTML, credentials, custom ports or unknown hosts. */
export function normalizeVideoUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("INVALID_VIDEO");
  const host = url.hostname;
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1);
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    id = url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)$/)?.[1] ?? null;
  }
  if (host === "www.youtube-nocookie.com") id = url.pathname.match(/^\/embed\/([\w-]+)$/)?.[1] ?? null;
  if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
  if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
    const match = url.pathname.match(host === "player.vimeo.com" ? /^\/video\/(\d+)$/ : /^\/(\d+)(?:\/([a-fA-F0-9]+))?\/?$/);
    if (match) {
      const hash = match[2] ?? url.searchParams.get("h");
      if (hash && !/^[a-fA-F0-9]{6,64}$/.test(hash)) throw new Error("INVALID_VIDEO");
      return `https://player.vimeo.com/video/${match[1]}${hash ? `?h=${hash}` : ""}`;
    }
  }
  throw new Error("INVALID_VIDEO");
}

export const lessonInput = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(10000),
  videoUrl: z.string().trim().max(2048).transform((value, ctx) => {
    try { return normalizeVideoUrl(value); }
    catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe um link HTTPS válido do YouTube ou Vimeo." }); return z.NEVER; }
  }),
  durationMinutes: z.number().int().min(1).max(1440),
}).strict();

export const lessonChange = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), data: lessonInput }).strict(),
  z.object({ action: z.literal("status"), status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }).strict(),
  z.object({ action: z.literal("move"), direction: z.enum(["up", "down"]) }).strict(),
]);

export type LessonView = {
  id: string; title: string; description: string; durationMinutes: number; position: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; videoUrl: string;
};
