/**
 * Provider-agnostic contract for the private object storage (Cloudflare R2, private bucket).
 * One bucket, two prefixes:
 *   - materials/…  PDFs of materials: never public; access only through short-lived signed URLs.
 *   - covers/…     validated cover images: served publicly ONLY through GET /api/materials/covers/[file],
 *                  which accepts nothing but content-addressed cover names (never a PDF key).
 * Until a provider is configured, every operation fails closed with 503 STORAGE_NOT_CONFIGURED.
 */
export class StorageError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}

export type SignedUpload = {
  url: string;
  method: "PUT";
  /** Headers the browser must send unchanged so the signature matches. */
  headers: Record<string, string>;
  expiresAt: Date;
};

export type CoverObjectType = "image/png" | "image/jpeg" | "image/webp";

export interface PrivateObjectStorage {
  readonly configured: boolean;
  createUploadUrl(input: { key: string; contentType: "application/pdf"; contentLength: number; expiresInSeconds: number }): Promise<SignedUpload>;
  /** Server-side write of an already validated cover image (small; never a PDF). */
  putObject(input: { key: string; body: Uint8Array; contentType: CoverObjectType }): Promise<void>;
  /** null when the object does not exist. */
  headObject(key: string): Promise<{ size: number; contentType: string | null } | null>;
  readObject(key: string): Promise<ReadableStream<Uint8Array>>;
  deleteObject(key: string): Promise<void>;
  createDownloadUrl(input: { key: string; filename: string; expiresInSeconds: number }): Promise<string>;
}

const notConfigured = async (): Promise<never> => { throw new StorageError(503, "STORAGE_NOT_CONFIGURED"); };

/** Placeholder provider: no network access, no simulated success. */
export const unconfiguredStorage: PrivateObjectStorage = {
  configured: false,
  createUploadUrl: notConfigured,
  putObject: notConfigured,
  headObject: notConfigured,
  readObject: notConfigured,
  deleteObject: notConfigured,
  createDownloadUrl: notConfigured,
};
