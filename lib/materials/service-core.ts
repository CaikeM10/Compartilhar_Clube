import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { materialInput, materialChange, materialId, materialOrder, pdfAction, pdfRemoval, PDF_MAX_BYTES } from "./validation";
import { StorageError, unconfiguredStorage, type PrivateObjectStorage } from "@/lib/storage/private-storage";
import { COVER_MAX_BYTES, COVER_ROUTE, COVER_TYPES, coverStorageKey, coverTypeOfFile, inspectCoverImage, uploadedCoverFile } from "./cover-image";

export class MaterialError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
type Guards = { requireAdmin: () => Promise<unknown>; requireActiveSubscription: () => Promise<unknown> };
/**
 * knownCovers: local images that may be used as covers (the static catalog images). A cover outside this list
 * is accepted only if some material already uses it, or if it is an uploaded cover (/api/materials/covers/<sha256>.<ext>)
 * that exists in storage. Default is empty: fail closed to covers already in the database.
 */
type Options = { knownCovers?: readonly string[] };
type MaterialReader = Pick<PrismaClient, "material">;

const orderBy = [{ displayOrder: "asc" }, { id: "asc" }] as const;
// Asset fields safe to show to administrators. storageKey never leaves the server.
const assetSummary = { id: true, originalFilename: true, fileSize: true, version: true, status: true, createdAt: true } as const;
const adminInclude = {
  assets: { where: { status: { in: ["PENDING", "VALIDATED"] } }, orderBy: { version: "desc" }, select: assetSummary },
} satisfies Prisma.MaterialInclude;
// Public storefront: commercial data only.
const publicFields = { id: true, title: true, description: true, priceCents: true, currency: true, coverImage: true, checkoutUrl: true, isPremium: true } as const;
// Subscriber library: no price/checkout, only whether a validated PDF exists.
const libraryFields = { id: true, title: true, description: true, coverImage: true, isPremium: true } as const;

const UPLOAD_URL_SECONDS = 600;
const DOWNLOAD_URL_SECONDS = 60;
const ORDER_LOCK = 61420321;
const ASSET_LOCK = 61420322;

function parseId(id: unknown) {
  const parsed = materialId.safeParse(id);
  if (!parsed.success) throw new MaterialError(404, "MATERIAL_NOT_FOUND");
  return parsed.data;
}

/** Streams the stored object: checks the %PDF- signature, byte count and sha256. */
async function inspectPdf(stream: ReadableStream<Uint8Array>, expectedSize: number) {
  const reader = stream.getReader();
  const hash = createHash("sha256");
  const head: number[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > expectedSize || size > PDF_MAX_BYTES) { await reader.cancel(); return null; }
    for (let i = 0; head.length < 5 && i < part.value.byteLength; i++) head.push(part.value[i]);
    hash.update(part.value);
  }
  if (size !== expectedSize || String.fromCharCode(...head) !== "%PDF-") return null;
  return hash.digest("hex");
}

export function createMaterialService(db: PrismaClient, guards: Guards, storage: PrivateObjectStorage = unconfiguredStorage, options: Options = {}) {
  const knownCovers = new Set(options.knownCovers ?? []);
  function requireStorage() {
    if (!storage.configured) throw new StorageError(503, "STORAGE_NOT_CONFIGURED");
  }
  /** Server-side counterpart of the admin cover picker: known images or validated uploads, never arbitrary paths. */
  async function assertKnownCover(client: MaterialReader, cover: string | undefined) {
    if (cover === undefined || knownCovers.has(cover)) return;
    const used = await client.material.findFirst({ where: { coverImage: cover }, select: { id: true } });
    if (used) return;
    const file = cover.startsWith(COVER_ROUTE) ? uploadedCoverFile(cover) : null;
    if (file && storage.configured && await storage.headObject(coverStorageKey(file))) return;
    throw new MaterialError(400, "INVALID_COVER");
  }

  return {
    async listAdmin() {
      await guards.requireAdmin();
      return db.material.findMany({ orderBy: [...orderBy], include: adminInclude });
    },
    async getAdmin(id: string) {
      await guards.requireAdmin();
      const material = await db.material.findUnique({ where: { id: parseId(id) }, include: adminInclude });
      if (!material) throw new MaterialError(404, "MATERIAL_NOT_FOUND");
      return material;
    },
    /** Public storefront (Etapa D). Unauthenticated by design: PUBLISHED rows, commercial fields only. */
    async listPublished() {
      return db.material.findMany({ where: { status: "PUBLISHED" }, orderBy: [...orderBy], select: publicFields });
    },
    /** Subscriber library: PUBLISHED rows plus a boolean telling whether a validated PDF exists. */
    async listLibrary() {
      await guards.requireActiveSubscription();
      const rows = await db.material.findMany({
        where: { status: "PUBLISHED" }, orderBy: [...orderBy],
        select: { ...libraryFields, assets: { where: { status: "VALIDATED" }, select: { id: true }, take: 1 } },
      });
      return rows.map(({ assets, ...row }) => ({ ...row, hasPdf: assets.length > 0 }));
    },
    async create(input: unknown) {
      await guards.requireAdmin();
      const parsed = materialInput.safeParse(input);
      if (!parsed.success) throw new MaterialError(400, "INVALID_MATERIAL");
      await assertKnownCover(db, parsed.data.coverImage);
      return db.material.create({ data: { ...parsed.data, status: "DRAFT" } });
    },
    async change(id: string, input: unknown) {
      await guards.requireAdmin();
      const parsed = materialChange.safeParse(input);
      if (!parsed.success) throw new MaterialError(400, "INVALID_MATERIAL");
      const target = parseId(id);
      return db.$transaction(async tx => {
        await assertKnownCover(tx, parsed.data.data.coverImage);
        // Optimistic concurrency prevents one administrator from overwriting another.
        const changed = await tx.material.updateMany({
          where: { id: target, updatedAt: new Date(parsed.data.expectedUpdatedAt) }, data: parsed.data.data,
        });
        if (changed.count !== 1) throw new MaterialError(409, "MATERIAL_CHANGED_OR_MISSING");
        const updated = await tx.material.findUniqueOrThrow({ where: { id: target } });
        // Publication rule, checked on the resulting row so it also covers clearing the link of a published
        // material. Throwing here rolls the whole transaction back.
        if (updated.status === "PUBLISHED" && !updated.checkoutUrl) throw new MaterialError(422, "MATERIAL_NOT_PUBLISHABLE");
        return updated;
      });
    },
    // Deletion is deliberately represented by status ARCHIVED through change().

    /** Rewrites displayOrder of every non-archived material. The list must be complete and current. */
    async reorder(input: unknown) {
      await guards.requireAdmin();
      const parsed = materialOrder.safeParse(input);
      if (!parsed.success) throw new MaterialError(400, "INVALID_ORDER");
      const order = parsed.data.order;
      return db.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${ORDER_LOCK})`);
        const current = await tx.material.findMany({ where: { status: { not: "ARCHIVED" } }, select: { id: true } });
        const known = new Set(current.map(row => row.id));
        if (known.size !== order.length || order.some(id => !known.has(id))) throw new MaterialError(409, "MATERIAL_ORDER_STALE");
        for (let displayOrder = 0; displayOrder < order.length; displayOrder++) {
          await tx.material.update({ where: { id: order[displayOrder] }, data: { displayOrder } });
        }
        return tx.material.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: [...orderBy], select: { id: true, displayOrder: true } });
      });
    },

    /** Dispatches POST /api/admin/materials/[id]/pdf: start a signed upload or confirm it. */
    async pdf(id: string, input: unknown) {
      await guards.requireAdmin();
      const parsed = pdfAction.safeParse(input);
      if (!parsed.success) throw new MaterialError(400, "INVALID_PDF_REQUEST");
      const target = parseId(id);
      requireStorage();
      return parsed.data.action === "start"
        ? startUpload(target, parsed.data)
        : confirmUpload(target, parsed.data.assetId);
    },

    /** Detaches the current PDF (VALIDATED -> ARCHIVED). The stored object is kept; no physical deletion. */
    async removePdf(id: string, input: unknown) {
      await guards.requireAdmin();
      const parsed = pdfRemoval.safeParse(input);
      if (!parsed.success) throw new MaterialError(400, "INVALID_PDF_REQUEST");
      const removed = await db.materialAsset.updateMany({
        where: { id: parsed.data.assetId, materialId: parseId(id), status: "VALIDATED" }, data: { status: "ARCHIVED" },
      });
      if (removed.count !== 1) throw new MaterialError(409, "PDF_CHANGED_OR_MISSING");
      return { removed: parsed.data.assetId };
    },

    /**
     * Cover upload (admin). The bytes are validated in memory BEFORE anything is stored: real format by signature
     * (PNG/JPEG/WebP only), declared type must match, size and dimensions. Content-addressed key: same image, same file.
     */
    async uploadCover(bytes: Uint8Array, declaredType: string) {
      await guards.requireAdmin();
      requireStorage();
      if (bytes.byteLength > COVER_MAX_BYTES) throw new MaterialError(413, "COVER_TOO_LARGE");
      const info = inspectCoverImage(bytes);
      if (!info || info.contentType !== declaredType) throw new MaterialError(422, "COVER_INVALID");
      const file = `${createHash("sha256").update(bytes).digest("hex")}.${COVER_TYPES[info.contentType]}`;
      const key = coverStorageKey(file);
      if (!await storage.headObject(key)) await storage.putObject({ key, body: bytes, contentType: info.contentType });
      return { coverImage: `${COVER_ROUTE}${file}`, width: info.width, height: info.height };
    },

    /**
     * Public cover read (no session, like listPublished). Only content-addressed cover names map to a key, always under
     * covers/: PDF keys (materials/…) can never be reached. The stored object must still look like that cover.
     */
    async readCover(name: string) {
      const file = uploadedCoverFile(name);
      if (!file) throw new MaterialError(404, "COVER_NOT_FOUND");
      requireStorage();
      const key = coverStorageKey(file);
      const head = await storage.headObject(key);
      const contentType = coverTypeOfFile(file);
      if (!head || head.contentType !== contentType || head.size < 1 || head.size > COVER_MAX_BYTES) throw new MaterialError(404, "COVER_NOT_FOUND");
      return { body: await storage.readObject(key), contentType, size: head.size };
    },

    /** Subscriber download: authorization, publication and file availability are checked before any URL is signed. */
    async download(id: string) {
      await guards.requireActiveSubscription();
      const material = await db.material.findFirst({
        where: { id: parseId(id), status: "PUBLISHED" },
        select: { assets: { where: { status: "VALIDATED" }, select: { storageKey: true, originalFilename: true }, take: 1 } },
      });
      if (!material) throw new MaterialError(404, "MATERIAL_NOT_FOUND");
      const asset = material.assets[0];
      if (!asset) throw new MaterialError(404, "PDF_NOT_AVAILABLE");
      requireStorage();
      return storage.createDownloadUrl({ key: asset.storageKey, filename: asset.originalFilename, expiresInSeconds: DOWNLOAD_URL_SECONDS });
    },
  };

  async function startUpload(target: string, data: { filename: string; size: number; contentType: "application/pdf" }) {
    const asset = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${ASSET_LOCK})`);
      const material = await tx.material.findFirst({ where: { id: target, status: { not: "ARCHIVED" } }, select: { id: true } });
      if (!material) throw new MaterialError(404, "MATERIAL_NOT_FOUND");
      const last = await tx.materialAsset.aggregate({ where: { materialId: target }, _max: { version: true } });
      const version = (last._max.version ?? 0) + 1;
      return tx.materialAsset.create({
        data: {
          materialId: target, version, status: "PENDING", mimeType: data.contentType, fileSize: data.size, originalFilename: data.filename,
          // Opaque key: no user-controlled path segments.
          storageKey: `materials/${target}/v${version}-${randomUUID()}.pdf`,
        },
        select: { id: true, storageKey: true, version: true },
      });
    });
    try {
      const upload = await storage.createUploadUrl({
        key: asset.storageKey, contentType: data.contentType, contentLength: data.size, expiresInSeconds: UPLOAD_URL_SECONDS,
      });
      return { assetId: asset.id, version: asset.version, upload };
    } catch (error) {
      await db.materialAsset.updateMany({ where: { id: asset.id, status: "PENDING" }, data: { status: "REJECTED" } });
      throw error;
    }
  }

  async function confirmUpload(target: string, assetId: string) {
    const asset = await db.materialAsset.findFirst({
      where: { id: assetId, materialId: target, status: "PENDING" }, select: { id: true, storageKey: true, fileSize: true },
    });
    if (!asset) throw new MaterialError(404, "PDF_UPLOAD_NOT_FOUND");
    const head = await storage.headObject(asset.storageKey);
    if (!head) throw new MaterialError(409, "PDF_UPLOAD_MISSING");
    const checksum = head.size === asset.fileSize && head.contentType === "application/pdf"
      ? await inspectPdf(await storage.readObject(asset.storageKey), asset.fileSize)
      : null;
    if (!checksum) {
      await db.materialAsset.updateMany({ where: { id: asset.id, status: "PENDING" }, data: { status: "REJECTED" } });
      // Rejected uploads are not kept in the private bucket; failure to clean up does not hide the rejection.
      await storage.deleteObject(asset.storageKey).catch(() => undefined);
      throw new MaterialError(422, "PDF_INVALID");
    }
    return db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${ASSET_LOCK})`);
      // At most one VALIDATED asset per material (also enforced by a partial unique index).
      await tx.materialAsset.updateMany({ where: { materialId: target, status: "VALIDATED" }, data: { status: "ARCHIVED" } });
      const validated = await tx.materialAsset.updateMany({ where: { id: asset.id, status: "PENDING" }, data: { status: "VALIDATED", checksum } });
      if (validated.count !== 1) throw new MaterialError(409, "PDF_CHANGED_OR_MISSING");
      return tx.materialAsset.findUniqueOrThrow({ where: { id: asset.id }, select: assetSummary });
    });
  }
}
