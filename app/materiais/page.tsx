"use client";

import { Container } from "@/components/layout/Container";
import { MaterialCard } from "@/components/materials/MaterialCard";

export default function MateriaisPage() {
  return (
    <Container>
      <div className="py-16 space-y-10">
        {/* Título */}
        <div className="max-w-3xl">
          <h1 className="text-3xl md:text-4xl font-bold text-primary font-display mb-3">
            Materiais Avulsos
          </h1>
          <p className="text-muted-foreground text-lg">
            Adquira materiais individuais com acesso direto no Canva, sem a
            necessidade de assinatura completa da plataforma.
          </p>
        </div>

        {/* Grid de materiais */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <MaterialCard
            title="Atividades de Alfabetização – Pacote Completo"
            description="Conjunto completo de atividades práticas para trabalhar consciência fonológica, leitura e escrita."
            pages={50}
            audience="Professores e Psicopedagogos"
            price="R$ 39,90"
            canvaUrl="https://www.canva.com/"
            isPremium
          />

          <MaterialCard
            title="Jogos Pedagógicos para Desenvolvimento Cognitivo"
            description="Jogos estruturados para atenção, memória, funções executivas e raciocínio lógico."
            pages={30}
            audience="Educadores e Profissionais da Educação"
            price="R$ 29,90"
            canvaUrl="https://www.canva.com/"
          />

          <MaterialCard
            title="Material de Avaliação Psicopedagógica"
            description="Protocolos, fichas e instrumentos para avaliação psicopedagógica."
            pages={25}
            audience="Psicopedagogos"
            price="R$ 34,90"
            canvaUrl="https://www.canva.com/"
          />
        </div>
      </div>
    </Container>
  );
}
