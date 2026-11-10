import { materials } from "@/lib/materials/catalog";
import { MemberLayout } from "@/components/layout/MemberLayout";
import { requirePageAccess } from "@/lib/auth/page-access";
import { MaterialLibraryCard } from "@/components/library/MaterialLibraryCard";

export default async function RecursosPage() {
  const { user } = await requirePageAccess("subscriber");
  return (
    <>
      <MemberLayout viewer={user}>
        <div className="space-y-12">
          {/* HEADER */}
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-3 font-display">
              Biblioteca de Materiais do Clube
            </h1>
            <p className="text-lg text-muted-foreground max-w-3xl">
              Todos os materiais deste catálogo estão incluídos na sua assinatura
              vigente, sem pagamento adicional. Os PDFs ficarão disponíveis aqui
              quando os arquivos privados estiverem prontos para acesso.
            </p>
          </div>

          {/* GRID DE MATERIAIS */}
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {materials.map((material) => (
              <MaterialLibraryCard key={material.id} {...material} />
            ))}
          </div>
        </div>
      </MemberLayout>
    </>
  );
}
