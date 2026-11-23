import Link from "next/link";
import { getCarouselItems } from "@/lib/materials/pages";
import { MaterialsCarousel } from "@/components/materials/MaterialsCarousel";

/**
 * Server wrapper for the Home carousel: resolves the curated materials on the server.
 * A failure with persistence enabled shows an explicit notice for this section only (never the static catalog);
 * no published curated material renders nothing (the "Ver todos" call to action below still links to /materiais).
 */
export async function HomeMaterialsCarousel() {
  const carousel = await getCarouselItems();
  if (carousel.kind === "unavailable") {
    return (
      <div role="status" className="mx-auto max-w-xl rounded-2xl border border-border/60 bg-white p-6 text-center">
        <p className="font-semibold text-primary">Materiais indisponíveis no momento</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Não foi possível carregar os destaques agora.{" "}
          <Link href="/materiais" className="text-primary underline underline-offset-4">Ver todos os materiais</Link>
        </p>
      </div>
    );
  }
  if (carousel.items.length === 0) return null;
  return <MaterialsCarousel items={carousel.items} />;
}
