import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { MaterialCard } from "@/components/materials/MaterialCard";
import { ArrowLeft } from "lucide-react";

import { getPublicCatalog } from "@/lib/materials/pages";
import { JsonLd } from "@/components/seo/JsonLd";
import { SITE_URL, breadcrumb, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Materiais pedagógicos e terapêuticos",
  description: "Jogos, atividades de leitura e recursos socioemocionais em PDF, prontos para aplicar com crianças e adolescentes na escola, no consultório e em intervenções.",
  path: "/materiais",
});

/** "R$ 1.234,90" -> "1234.90" (preço já exibido no cartão); null se não houver preço legível. */
function offerPrice(price: string) {
  const match = /^R\$\s*([\d.]+),(\d{2})$/.exec(price.trim());
  return match ? `${match[1].replace(/\./g, "")}.${match[2]}` : null;
}

/** Somente o que está visível nos cartões: nome, capa pública, preço e link de compra. Nunca PDFs nem dados de assinantes. */
function catalogStructuredData(materials: Awaited<ReturnType<typeof getPublicCatalog>>) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Materiais individuais do Compartilhar Clube",
    itemListElement: materials.map((item, index) => {
      const price = offerPrice(item.price);
      return {
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Product",
          name: item.title,
          image: new URL(encodeURI(item.image), SITE_URL).href,
          ...(price && item.checkoutUrl
            ? { offers: { "@type": "Offer", price, priceCurrency: "BRL", url: item.checkoutUrl, availability: "https://schema.org/InStock" } }
            : {}),
        },
      };
    }),
  };
}

// Statically cached; refreshed on demand by admin writes (revalidateMaterialPages) and at most every 5 minutes.
export const revalidate = 300;

export default async function MateriaisPage() {
  const materials = await getPublicCatalog();
  return (
    <Container>
      <JsonLd data={breadcrumb([{ name: "Início", path: "/" }, { name: "Materiais", path: "/materiais" }])} />
      {materials.length > 0 && <JsonLd data={catalogStructuredData(materials)} />}
      <div className="py-20 space-y-16">
        {/* VOLTAR */}
        <div className="flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao site
          </Link>
        </div>

        {/* TÍTULO CENTRAL */}
        <div className="text-center max-w-4xl mx-auto space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold text-primary font-display">
            Materiais Individuais
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground">
            Escolha, compre e receba imediatamente seus materiais em PDF.
            Conteúdos prontos para uso, sem necessidade de assinatura.
          </p>
        </div>

        {/* GRID DE MATERIAIS */}
        {materials.length === 0 ? (
          <p className="text-center text-muted-foreground" role="status">Nenhum material disponível no momento.</p>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {materials.map(({ id, ...item }) => (
              <MaterialCard key={id} {...item} />
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}
