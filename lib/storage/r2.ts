import "server-only";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageError, type PrivateObjectStorage } from "./private-storage";

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };
type Client = Pick<S3Client, "send">;
type Sign = (client: S3Client, command: PutObjectCommand | GetObjectCommand, options: { expiresIn: number; signableHeaders?: Set<string> }) => Promise<string>;

/** Provider errors never leak details (endpoint, bucket, credentials): one fixed code. */
const unavailable = () => new StorageError(503, "STORAGE_UNAVAILABLE");
function isNotFound(error: unknown) {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

export function createR2Client(config: R2Config) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // R2 does not need the SDK's default flexible checksums; sending them would add headers to presigned uploads.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

/** RFC 6266 attachment header: ASCII fallback plus the UTF-8 name. */
export function attachmentDisposition(filename: string) {
  const ascii = filename.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "").trim() || "material.pdf";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function createR2Storage(config: R2Config, client: Client = createR2Client(config), sign: Sign = getSignedUrl as Sign): PrivateObjectStorage {
  const Bucket = config.bucket;
  async function call<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); } catch (error) { if (error instanceof StorageError) throw error; throw unavailable(); }
  }
  return {
    configured: true,
    createUploadUrl: ({ key, contentType, contentLength, expiresInSeconds }) => call(async () => {
      const command = new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, ContentLength: contentLength });
      // Content-Type is part of the signature: the browser must send exactly this header.
      const url = await sign(client as S3Client, command, { expiresIn: expiresInSeconds, signableHeaders: new Set(["content-type"]) });
      return { url, method: "PUT" as const, headers: { "Content-Type": contentType }, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
    }),
    putObject: ({ key, body, contentType }) => call(async () => {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.byteLength }));
    }),
    headObject: key => call(async () => {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: Number(head.ContentLength ?? -1), contentType: head.ContentType ?? null };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw unavailable();
      }
    }),
    readObject: key => call(async () => {
      const object = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      if (!object.Body) throw unavailable();
      return object.Body.transformToWebStream() as ReadableStream<Uint8Array>;
    }),
    deleteObject: key => call(async () => { await client.send(new DeleteObjectCommand({ Bucket, Key: key })); }),
    createDownloadUrl: ({ key, filename, expiresInSeconds }) => call(() => sign(client as S3Client,
      new GetObjectCommand({ Bucket, Key: key, ResponseContentType: "application/pdf", ResponseContentDisposition: attachmentDisposition(filename) }),
      { expiresIn: expiresInSeconds })),
  };
}
