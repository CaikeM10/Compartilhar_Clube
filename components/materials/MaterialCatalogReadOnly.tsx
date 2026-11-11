import { Card } from "@/components/ui/card";
import { materials } from "@/lib/materials/catalog";

/** Read-only catalog shown when material persistence is not enabled in the current environment. */
export function MaterialCatalogReadOnly() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">Gerenciar Recursos</h1>
        <p className="text-muted-foreground text-lg">Catálogo comercial de materiais</p>
      </div>
      <Card className="p-6 gap-2 border-accent/30 bg-accent/5" role="status">
        <h2 className="font-semibold text-primary">Catálogo em modo de consulta</h2>
        <p className="text-sm text-muted-foreground">Os 15 materiais da vitrine estão listados abaixo. Cadastro, edição, ordenação e publicação exigem a persistência de materiais habilitada neste ambiente. Nenhum PDF está disponível nesta etapa.</p>
      </Card>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
        {materials.map((material, index) => (
          <Card key={material.id} className="p-6 gap-4 min-w-0">
            <img src={material.image} alt={material.title} loading="lazy" className="w-full h-48 object-contain rounded-lg" />
            <h2 className="text-lg font-semibold text-primary font-display break-words">{material.title}</h2>
            <p className="font-semibold text-primary">{material.price}</p>
            <p className="text-xs text-muted-foreground">Ordem na vitrine: {index + 1} · Presente na vitrine atual</p>
            <p className="text-sm text-muted-foreground">PDF privado: ainda indisponível</p>
            {material.isPremium && <p className="text-xs text-accent">Selo visual: Premium</p>}
            {!material.checkoutUrl && <p className="text-sm text-muted-foreground">Link comercial não informado</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}
