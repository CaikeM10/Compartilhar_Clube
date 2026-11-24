// Client-safe helpers for the admin materials panel. The server revalidates everything.
import { parsePriceToCents } from "./price";
import type { MaterialAdminView, MaterialStatusView } from "./types";
import { COVER_MAX_BYTES, isCoverContentType } from "./cover-image";

const ADMIN_BASE = "/api/admin/materials";
export const PDF_LIMIT_BYTES = 25 * 1024 * 1024; // same limit as lib/materials/validation.ts (PDF_MAX_BYTES)

export type MaterialFormValues = {
  title: string; description: string; price: string; coverImage: string; checkoutUrl: string; isPremium: boolean; displayOrder?: string;
};
export class MaterialFormError extends Error {}

function fields(values: MaterialFormValues) {
  const priceCents = parsePriceToCents(values.price);
  if (priceCents === null) throw new MaterialFormError("Informe um preço válido em reais, por exemplo 4,90.");
  const title = values.title.trim();
  if (!title) throw new MaterialFormError("Informe o título do material.");
  if (!values.coverImage) throw new MaterialFormError("Escolha uma capa.");
  const description = values.description.trim();
  const checkoutUrl = values.checkoutUrl.trim();
  return { title, description: description || null, priceCents, coverImage: values.coverImage, checkoutUrl: checkoutUrl || null, isPremium: values.isPremium };
}

/** Body for POST /api/admin/materials (matches materialInput). The server always creates a DRAFT. */
export function buildMaterialInput(values: MaterialFormValues) {
  const displayOrder = Number(values.displayOrder);
  if (!Number.isSafeInteger(displayOrder) || displayOrder < 1) throw new MaterialFormError("Informe uma posição a partir de 1.");
  return { ...fields(values), currency: "BRL" as const, displayOrder: displayOrder - 1 };
}

/** Body for PATCH /api/admin/materials/[id] with only the fields that actually changed (or null if none). */
export function buildMaterialChange(material: MaterialAdminView, values: MaterialFormValues) {
  const next = fields(values);
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof typeof next)[]) {
    if (next[key] !== material[key]) data[key] = next[key];
  }
  return Object.keys(data).length ? { expectedUpdatedAt: material.updatedAt, data } : null;
}

export function buildStatusChange(material: MaterialAdminView, status: MaterialStatusView) {
  return { expectedUpdatedAt: material.updatedAt, data: { status } };
}

/** Full ordered list for PUT /api/admin/materials/order, or null when the move is out of bounds. */
export function moveInOrder(ids: string[], index: number, direction: "up" | "down") {
  const target = index + (direction === "up" ? -1 : 1);
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return null;
  const order = [...ids];
  [order[index], order[target]] = [order[target], order[index]];
  return { order };
}

const messages: Record<string, string> = {
  INVALID_MATERIAL: "Confira os campos: título, preço, capa local e link Hotmart (opcional, https://go.hotmart.com).",
  INVALID_ORDER: "A ordem enviada é inválida. Atualize a lista e tente novamente.",
  INVALID_PDF_REQUEST: "A solicitação de PDF é inválida.",
  JSON_REQUIRED: "Não foi possível enviar os dados. Atualize a página e tente novamente.",
  INVALID_JSON: "Não foi possível enviar os dados. Atualize a página e tente novamente.",
  BODY_TOO_LARGE: "Os dados enviados são grandes demais. Reduza a descrição.",
  UNAUTHENTICATED: "Sua sessão terminou. Entre novamente.",
  FORBIDDEN: "Você não tem permissão para gerenciar materiais.",
  INVALID_ORIGIN: "Não foi possível validar a origem. Reabra a plataforma pelo endereço configurado.",
  MATERIAL_NOT_FOUND: "Este material não foi encontrado. A lista foi atualizada.",
  MATERIAL_CHANGED_OR_MISSING: "Este material foi alterado por outra pessoa ou sessão. A lista foi atualizada; revise e tente novamente.",
  MATERIAL_NOT_PUBLISHABLE: "Para publicar, informe o link Hotmart do material. Um material publicado não pode ficar sem link.",
  INVALID_COVER: "Escolha uma capa da lista ou envie uma nova imagem.",
  COVER_INVALID: "A imagem foi recusada. Envie um arquivo PNG, JPG ou WebP válido, entre 200 e 8000 pixels de lado.",
  COVER_TOO_LARGE: "A imagem é grande demais. O limite é 3 MB.",
  COVER_TYPE_UNSUPPORTED: "Formato de imagem não aceito. Use PNG, JPG ou WebP.",
  PDF_INVALID: "O arquivo enviado não é um PDF válido ou chegou incompleto. Envie novamente.",
  PDF_UPLOAD_NOT_FOUND: "O envio do PDF expirou ou não foi encontrado. Envie novamente.",
  PDF_UPLOAD_MISSING: "O PDF não chegou ao armazenamento. Envie novamente.",
  PDF_UPLOAD_FAILED: "Não foi possível transferir o PDF. Verifique a conexão e envie novamente.",
  STORAGE_UNAVAILABLE: "O armazenamento de arquivos está indisponível no momento. Tente novamente em instantes.",
  MATERIAL_CONFLICT: "Houve um conflito com outra alteração. Atualize a lista e tente novamente.",
  MATERIAL_ORDER_STALE: "A lista mudou desde que foi carregada. Ela foi atualizada; tente reordenar novamente.",
  PDF_CHANGED_OR_MISSING: "O PDF deste material mudou. A lista foi atualizada.",
  MATERIALS_PERSISTENCE_DISABLED: "O gerenciamento de materiais não está habilitado neste ambiente.",
  STORAGE_NOT_CONFIGURED: "O armazenamento de arquivos (capas e PDFs) ainda não está configurado.",
  MATERIALS_UNAVAILABLE: "O serviço de materiais está indisponível no momento. Tente novamente em instantes.",
};
const byStatus: Record<number, string> = {
  400: "Confira os dados informados.", 401: messages.UNAUTHENTICATED, 403: messages.FORBIDDEN,
  404: "O item não foi encontrado. Atualize a lista.", 409: "Houve um conflito com outra alteração. Atualize a lista.",
  413: messages.COVER_TOO_LARGE, 415: messages.COVER_TYPE_UNSUPPORTED, 422: "O arquivo foi recusado pela validação.",
  503: messages.MATERIALS_UNAVAILABLE,
};
export function materialErrorMessage(status: number, code?: string) {
  return (code && messages[code]) || byStatus[status] || "Não foi possível concluir a operação. Atualize a lista e tente novamente.";
}
/** Errors after which the visible list is stale and must be reloaded. */
export function shouldReload(status: number) {
  return status === 404 || status === 409;
}

export type AdminResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code?: string };

export async function adminRequest<T>(fetchImpl: typeof fetch, path: string, method = "GET", body?: unknown): Promise<AdminResult<T>> {
  let response: Response;
  try {
    response = await fetchImpl(path, {
      method, credentials: "same-origin", cache: "no-store",
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
  } catch { return { ok: false, status: 0, code: "NETWORK_ERROR" }; }
  const payload = await response.json().catch(() => null);
  if (response.ok) return { ok: true, status: response.status, data: payload as T };
  return { ok: false, status: response.status, code: typeof payload?.error === "string" ? payload.error : undefined };
}

/** Early feedback before sending a cover (the server checks the real bytes again). */
export function coverFileError(file: { type: string; size: number }) {
  if (!isCoverContentType(file.type)) return messages.COVER_TYPE_UNSUPPORTED;
  if (file.size < 1 || file.size > COVER_MAX_BYTES) return messages.COVER_TOO_LARGE;
  return null;
}

/** Sends the image bytes as-is (no multipart); the response carries the public cover path to store in the material. */
export async function uploadCover(fetchImpl: typeof fetch, file: Blob): Promise<AdminResult<{ coverImage: string }>> {
  let response: Response;
  try {
    response = await fetchImpl(`${ADMIN_BASE}/covers`, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": file.type }, body: file });
  } catch { return { ok: false, status: 0, code: "NETWORK_ERROR" }; }
  const payload = await response.json().catch(() => null);
  if (response.ok && typeof payload?.coverImage === "string") return { ok: true, status: response.status, data: { coverImage: payload.coverImage } };
  return { ok: false, status: response.status, code: typeof payload?.error === "string" ? payload.error : undefined };
}

/** File name accepted by the server (no path or reserved characters, ends in .pdf, at most 255 characters). */
export function safePdfFilename(name: string) {
  const base = name.normalize("NFC").replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, "-").replace(/^[.\s]+|\s+$/g, "").slice(0, 200);
  return `${base || "material"}.pdf`;
}

export function pdfFileError(file: { type: string; size: number; name: string }) {
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) return "Escolha um arquivo PDF.";
  if (file.size < 1 || file.size > PDF_LIMIT_BYTES) return "O PDF deve ter no máximo 25 MB.";
  return null;
}

type PdfStart = { assetId: string; upload: { url: string; method: "PUT"; headers: Record<string, string> } };

/**
 * Three steps: the server reserves a version and signs a short-lived upload URL; the browser sends the file straight
 * to the private bucket (it never passes through the Vercel function); the server then validates the stored object.
 */
export async function uploadPdf(fetchImpl: typeof fetch, materialId: string, file: File): Promise<AdminResult<unknown>> {
  const path = `${ADMIN_BASE}/${encodeURIComponent(materialId)}/pdf`;
  const start = await adminRequest<PdfStart>(fetchImpl, path, "POST", { action: "start", filename: safePdfFilename(file.name), contentType: "application/pdf", size: file.size });
  if (!start.ok) return start;
  let put: Response;
  try { put = await fetchImpl(start.data.upload.url, { method: "PUT", headers: start.data.upload.headers, body: file }); }
  catch { return { ok: false, status: 0, code: "PDF_UPLOAD_FAILED" }; }
  if (!put.ok) return { ok: false, status: put.status, code: "PDF_UPLOAD_FAILED" };
  return adminRequest(fetchImpl, path, "POST", { action: "confirm", assetId: start.data.assetId });
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
