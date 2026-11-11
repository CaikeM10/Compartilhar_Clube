// Client-safe view types (no server-only imports). storageKey is never part of any view.
export type MaterialStatusView = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type MaterialAssetView = {
  id: string;
  originalFilename: string;
  fileSize: number;
  version: number;
  status: "PENDING" | "VALIDATED";
  createdAt: string;
};

export type MaterialAdminView = {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  currency: "BRL";
  coverImage: string;
  checkoutUrl: string | null;
  isPremium: boolean;
  displayOrder: number;
  status: MaterialStatusView;
  updatedAt: string;
  assets: MaterialAssetView[];
};

type DateLike = Date | string;
type AdminRow = Omit<MaterialAdminView, "updatedAt" | "assets" | "currency" | "status"> & {
  currency: string; status: string; updatedAt: DateLike;
  assets: (Omit<MaterialAssetView, "createdAt" | "status"> & { status: string; createdAt: DateLike })[];
};
const iso = (value: DateLike) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());

/** Explicit field-by-field copy: only whitelisted fields reach the browser. */
export function toMaterialAdminView(row: AdminRow): MaterialAdminView {
  return {
    id: row.id, title: row.title, description: row.description, priceCents: row.priceCents, currency: "BRL",
    coverImage: row.coverImage, checkoutUrl: row.checkoutUrl, isPremium: row.isPremium, displayOrder: row.displayOrder,
    status: row.status as MaterialStatusView, updatedAt: iso(row.updatedAt),
    assets: row.assets.map(asset => ({
      id: asset.id, originalFilename: asset.originalFilename, fileSize: asset.fileSize, version: asset.version,
      status: asset.status as MaterialAssetView["status"], createdAt: iso(asset.createdAt),
    })),
  };
}
