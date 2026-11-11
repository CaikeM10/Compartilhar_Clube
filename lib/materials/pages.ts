import "server-only";
import { getMaterials } from "./server";
import { MaterialError } from "./service-core";
import { materials as catalog } from "./catalog";
import { formatPriceCents } from "./price";

/** Shape consumed by components/materials/MaterialCard (public storefront). */
export type PublicCatalogItem = { id: string; title: string; price: string; checkoutUrl: string; image: string; isPremium: boolean };
/** Shape consumed by components/library/MaterialLibraryCard (subscriber library). */
export type LibraryItem = { id: string; title: string; description: string | null; image: string; hasPdf: boolean };

/**
 * Static catalog is used ONLY when persistence is explicitly disabled in this environment.
 * Any other failure (database, authorization) propagates: it is never masked as the static catalog.
 */
function persistenceDisabled(error: unknown) {
  return error instanceof MaterialError && error.code === "MATERIALS_PERSISTENCE_DISABLED";
}

/** Public storefront: PUBLISHED materials in admin order. No authentication by design. */
export async function getPublicCatalog(): Promise<PublicCatalogItem[]> {
  let service;
  try { service = getMaterials(); } catch (error) {
    if (!persistenceDisabled(error)) throw error;
    return catalog.map(item => ({ id: item.id, title: item.title, price: item.price, checkoutUrl: item.checkoutUrl, image: item.image, isPremium: item.isPremium ?? false }));
  }
  const rows = await service.listPublished();
  // Explicit whitelist: nothing else reaches the browser.
  return rows.map(row => ({
    id: row.id, title: row.title, price: formatPriceCents(row.priceCents), checkoutUrl: row.checkoutUrl ?? "", image: row.coverImage, isPremium: row.isPremium,
  }));
}

/**
 * Subscriber library. Call only after requirePageAccess("subscriber"); with persistence enabled the
 * service re-checks the active subscription itself. The static fallback never offers downloads.
 */
export async function getLibrary(): Promise<LibraryItem[]> {
  let service;
  try { service = getMaterials(); } catch (error) {
    if (!persistenceDisabled(error)) throw error;
    return catalog.map(item => ({ id: item.id, title: item.title, description: null, image: item.image, hasPdf: false }));
  }
  const rows = await service.listLibrary();
  return rows.map(row => ({ id: row.id, title: row.title, description: row.description, image: row.coverImage, hasPdf: row.hasPdf }));
}
