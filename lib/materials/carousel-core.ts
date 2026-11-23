// Pure carousel data rules (no server-only, no database): used by lib/materials/pages.ts and the tests.
import catalog from "./catalog.json";
import selection from "./carousel.json";
import responsiveCovers from "./carousel-covers.json";

/** What the client carousel renders. srcSet is null when no responsive variants exist for the cover. */
export type CarouselItem = { id: string; title: string; src: string; srcSet: string | null };
/** Fields of listPublished() the carousel needs (rows arrive already filtered to PUBLISHED, in admin order). */
export type PublishedRow = { id: string; title: string; coverImage: string };

const WIDTHS = [260, 520, 780] as const;
const withVariants = new Set<string>(responsiveCovers);
const curated = new Map(selection.map(entry => [entry.materialId, entry]));
const originalTitle = new Map(catalog.map(item => [item.id, item.title]));

/**
 * Cover sources. Only names listed in carousel-covers.json have the pre-resized files
 * /materials-covers/<name>-{260,520,780}.webp; any other cover uses its original image without srcSet,
 * so no URL that does not exist is ever produced.
 */
export function coverSources(coverImage: string): Pick<CarouselItem, "src" | "srcSet"> {
  const name = /^\/([^/]+)\.webp$/.exec(coverImage)?.[1];
  if (!name || !withVariants.has(name)) return { src: coverImage, srcSet: null };
  return {
    src: `/materials-covers/${name}-520.webp`,
    srcSet: WIDTHS.map(width => `/materials-covers/${name}-${width}.webp ${width}w`).join(", "),
  };
}

/**
 * Title rule for the curated alternative titles in carousel.json: the alternative is used only while the
 * stored title still equals the original catalog title. Once an administrator renames the material, the
 * administrator's title wins.
 */
function carouselTitle(id: string, storedTitle: string) {
  const alternative = curated.get(id)?.title;
  return alternative && storedTitle === originalTitle.get(id) ? alternative : storedTitle;
}

/** Persistence disabled: exactly today's carousel (curated order, alternative titles, responsive covers). */
export function staticCarousel(): CarouselItem[] {
  return selection.map(entry => {
    const material = catalog.find(item => item.id === entry.materialId);
    if (!material) throw new Error("UNKNOWN_CAROUSEL_MATERIAL");
    return { id: material.id, title: entry.title ?? material.title, ...coverSources(material.image) };
  });
}

/**
 * Persistence enabled: the curated IDs resolved against the PUBLISHED rows, in the administrator's order.
 * Unpublished or archived materials are absent from the rows and therefore omitted; non-curated rows are ignored.
 */
export function persistedCarousel(rows: readonly PublishedRow[]): CarouselItem[] {
  return rows.filter(row => curated.has(row.id))
    .map(row => ({ id: row.id, title: carouselTitle(row.id, row.title), ...coverSources(row.coverImage) }));
}
