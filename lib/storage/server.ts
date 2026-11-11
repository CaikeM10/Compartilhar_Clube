import "server-only";
import { unconfiguredStorage, type PrivateObjectStorage } from "./private-storage";

/**
 * Single entry point for the private storage provider.
 * Cloudflare R2 will be wired here in Etapa E (pending authorization, SDK and credentials).
 */
export function getPrivateStorage(): PrivateObjectStorage {
  return unconfiguredStorage;
}
