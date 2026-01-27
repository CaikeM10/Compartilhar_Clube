"use client";

import { Container } from "@/components/layout/Container";
import { MaterialCard } from "@/components/materials/MaterialCard";

const materials = [
  {
    title: "Giras☀️l e a vida",
    description:
      "Atividades práticas para desenvolver leitura, escrita e consciência fonológica.",
    pages: 50,
    audience: "Professores e Psicopedagogos",
    price: "R$ 9,90",
    image: "girasol_vida.webp",
    canvaUrl: "https://www.canva.com/",
    isPremium: true,
  },
  {
    title: "Leitores de Palavras",
    description:
      "Jogos para atenção, memória, funções executivas e raciocínio lógico.",
    pages: 30,
    audience: "Educadores e Profissionais da Educação",
    price: "R$ 9,90",
    image: "leitoresdepalavras.webp",
    canvaUrl: "https://www.canva.com/",
  },
  {
    title: "Termômetro das Emoções",
    description: "Protocolos e instrumentos para avaliação psicopedagógica.",
    pages: 25,
    audience: "Psicopedagogos",
    price: "R$ 4,90",
    image: "termometro.webp",
    canvaUrl: "https://www.canva.com/",
  },

  /* === COMPLETE ATÉ 15 ITENS === */
  {
    title: "Marmita da Leitura",
    description: "Atividades lúdicas para incentivo à leitura.",
    pages: 20,
    audience: "Educação Infantil",
    price: "R$ 14,90",
    image: "marmitadaleitura.webp",
    canvaUrl: "https://www.canva.com/",
  },
  {
    title: "Caçadores de Palavras",
    description: "Exploração de palavras de forma divertida.",
    pages: 18,
    audience: "Ensino Fundamental",
    price: "R$ 14,90",
    image: "/caçadoresdepalavras.webp",
    canvaUrl: "https://www.canva.com/",
  },
  {
    title: "Arraiá da Alfabetização",
    description: "Alfabetização temática com atividades juninas.",
    pages: 22,
    audience: "Educação Infantil",
    price: "R$ 9,90",
    image: "/arraiá.webp",
    canvaUrl: "https://www.canva.com/",
  },
  {
    title: "Mood Kids",
    description: "Reconhecimento e expressão das emoções.",
    pages: 16,
    audience: "Educação Socioemocional",
    price: "R$ 9,90",
    image: "/moodkids.webp",
    canvaUrl: "https://www.canva.com/",
  },
  {
    title: "Varal Literário",
    description: "Leitura interativa com exposição em sala.",
    pages: 15,
    audience: "Ensino Fundamental",
    price: "R$ 6,90",
    image: "/varalliterário.webp",
    canvaUrl: "https://www.canva.com/",
  },
  {
    title: "Pipoca com Rima",
    description: "Consciência fonológica com rimas.",
    pages: 14,
    audience: "Alfabetização",
    price: "R$ 12,90",
    image: "/pipocacomrima.webp",
    canvaUrl: "https://www.canva.com/",
  },
  {
    title: "Jogo da Memória com Alfabeto",
    description: "Fixação das letras com jogos visuais.",
    pages: 12,
    audience: "Educação Infantil",
    price: "R$ 4,90",
    image: "/jogodamemória.webp",
    canvaUrl: "https://www.canva.com/",
  },
  {
    title: "Letras Iguais",
    description: "Discriminação visual e associação.",
    pages: 10,
    audience: "Alfabetização",
    price: "R$ 4,90",
    image: "/letrasiguais.webp",
    canvaUrl: "https://www.canva.com/",
  },
  {
    title: "Não Aceitamos Fiado",
    description: "Educação financeira infantil.",
    pages: 12,
    audience: "Educação Financeira",
    price: "R$ 12,90",
    image: "/não_aceitamos_fiado.webp",
    canvaUrl: "https://www.canva.com/",
  },
  {
    title: "Aprendendo Sobre a Felicidade",
    description: "Trabalho socioemocional com crianças.",
    pages: 20,
    audience: "Educação Socioemocional",
    price: "R$ 4,90",
    image: "/aprendendofelicidade.webp",
    canvaUrl: "https://www.canva.com/",
  },
];

export default function MateriaisPage() {
  return (
    <Container>
      <div className="py-16 space-y-12">
        {/* TÍTULO */}
        <div className="max-w-3xl">
          <h1 className="text-6xl md:text-9x1 font-bold text-primary font-display mb-5">
            Materiais Individuais
          </h1>
          <p className="text-muted-foreground text-4x1 md:text-2xl">
            Recursos educacionais prontos para uso, após a compra o PDF será
            disponibilizado.
          </p>
        </div>

        {/* GRID */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {materials.map((item, index) => (
            <MaterialCard key={index} {...item} />
          ))}
        </div>
      </div>
    </Container>
  );
}
