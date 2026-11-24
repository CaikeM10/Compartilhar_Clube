import "server-only";
import { unconfiguredStorage, type PrivateObjectStorage } from "./private-storage";
import { createR2Storage, type R2Config } from "./r2";

/**
 * Reads the Cloudflare R2 configuration. All four variables must be present and well formed; anything else keeps
 * the storage unconfigured (fail closed: 503 STORAGE_NOT_CONFIGURED). Values are never logged or returned.
 * Each environment uses its own bucket and its own token scoped to that bucket (ensaio and production are separate).
 */
export function readR2Config(env: NodeJS.ProcessEnv = process.env): R2Config | null {
  const config = {
    accountId: env.R2_ACCOUNT_ID ?? "", accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "", bucket: env.R2_BUCKET ?? "",
  };
  if (!/^[a-f0-9]{32}$/.test(config.accountId)) return null;
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket)) return null;
  if (!/^[A-Za-z0-9]{16,128}$/.test(config.accessKeyId) || !/^[A-Za-z0-9]{32,128}$/.test(config.secretAccessKey)) return null;
  return config;
}

let cached: { key: string; storage: PrivateObjectStorage } | null = null;

/** Single entry point for the storage provider (PDFs and covers share one private bucket, separate prefixes). */
export function getPrivateStorage(env: NodeJS.ProcessEnv = process.env): PrivateObjectStorage {
  const config = readR2Config(env);
  if (!config) return unconfiguredStorage;
  const key = `${config.accountId}/${config.bucket}/${config.accessKeyId}`;
  if (cached?.key !== key) cached = { key, storage: createR2Storage(config) };
  return cached.storage;
}
