/**
 * Provider-agnostic contract for private file storage (PDFs of materials).
 * The concrete provider (Cloudflare R2, private bucket) is not configured yet:
 * until it is, every operation fails closed with 503 STORAGE_NOT_CONFIGURED.
 * Objects are never public; access only through short-lived signed URLs.
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

export interface PrivateObjectStorage {
  readonly configured: boolean;
  createUploadUrl(input: { key: string; contentType: "application/pdf"; contentLength: number; expiresInSeconds: number }): Promise<SignedUpload>;
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
  headObject: notConfigured,
  readObject: notConfigured,
  deleteObject: notConfigured,
  createDownloadUrl: notConfigured,
};
