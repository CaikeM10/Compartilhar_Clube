import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { MaterialCard } from "@/components/materials/MaterialCard";
import { ArrowLeft } from "lucide-react";

import { getPublicCatalog } from "@/lib/materials/pages";

// Statically cached; refreshed on demand by admin writes (revalidateMaterialPages) and at most every 5 minutes.
export const revalidate = 300;

export default async function MateriaisPage() {
  const materials = await getPublicCatalog();
  return (
    <Container>
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
