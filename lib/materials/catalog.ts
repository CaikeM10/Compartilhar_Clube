import products from "./catalog.json";
import carousel from "./carousel.json";

/** Transitional single source. No private storage keys or download URLs belong here. */
export const materials = products;

export const carouselMaterials = carousel.map(selection => {
  const material = materials.find(item => item.id === selection.materialId);
  if (!material) throw new Error("UNKNOWN_CAROUSEL_MATERIAL");
  return {
    title: selection.title ?? material.title,
    image: material.image.slice(1).replace(/\.webp$/, ""),
  };
});
