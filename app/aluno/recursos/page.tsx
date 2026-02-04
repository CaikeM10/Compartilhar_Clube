import { MemberLayout } from "@/components/layout/MemberLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MaterialLibraryCard } from "@/components/library/MaterialLibraryCard";

export default function RecursosPage() {
  const materials = [
    {
      title: "Marmita da Leitura",
      image: "/marmitadaleitura.webp",
      fileUrl: "/pdfs/marmita-da-leitura.pdf",
    },
    {
      title: "Caçadores de Palavras",
      image: "/caçadoresdepalavras.webp",
      fileUrl: "/pdfs/cacadores-de-palavras.pdf",
    },
    {
      title: "Arraiá da Alfabetização",
      image: "/arraiá.webp",
      fileUrl: "/pdfs/arraia-da-alfabetizacao.pdf",
    },
    {
      title: "Leitores de Palavras",
      image: "/leitoresdepalavras.webp",
      fileUrl: "/pdfs/leitores-de-palavras.pdf",
    },
    {
      title: "Mood Kids",
      image: "/moodkids.webp",
      fileUrl: "/pdfs/mood-kids.pdf",
    },
    {
      title: "Termômetro das Emoções",
      image: "/termometro.webp",
      fileUrl: "/pdfs/termometro-das-emocoes.pdf",
    },
    {
      title: "Não Aceitamos Fiado",
      image: "/não_aceitamos_fiado.webp",
      fileUrl: "/pdfs/nao-aceitamos-fiado.pdf",
    },
    {
      title: "Pipoca com Rima",
      image: "/pipocacomrima.webp",
      fileUrl: "/pdfs/pipoca-com-rima.pdf",
    },
    {
      title: "Jogo da Memória das Emoções",
      image: "/jogodamemoria.webp",
      fileUrl: "/pdfs/jogo-da-memoria.pdf",
    },
    {
      title: "Intruso – Letra Inicial",
      image: "/intrusos.webp",
      fileUrl: "/pdfs/intruso-letra-inicial.pdf",
    },
    {
      title: "Aprendendo sobre a Felicidade",
      image: "/aprendendofelicidade.webp",
      fileUrl: "/pdfs/aprendendo-sobre-a-felicidade.pdf",
    },
    {
      title: "Letras Iguais",
      image: "/letrasiguais.webp",
      fileUrl: "/pdfs/letras-iguais.pdf",
    },
    {
      title: "Varal Literário",
      image: "/varalliterário.webp",
      fileUrl: "/pdfs/varal-literario.pdf",
    },
  ];

  return (
    <ProtectedRoute>
      <MemberLayout>
        <div className="space-y-12">
          {/* HEADER */}
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-3 font-display">
              Biblioteca de Materiais do Clube
            </h1>
            <p className="text-lg text-muted-foreground max-w-3xl">
              Aqui você encontra todos os materiais exclusivos do Compartilhar
              Clube. Os PDFs estão disponíveis para download e uso em sua
              prática profissional, respeitando os direitos autorais.
            </p>
          </div>

          {/* GRID DE MATERIAIS */}
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {materials.map((material, index) => (
              <MaterialLibraryCard key={index} {...material} />
            ))}
          </div>
        </div>
      </MemberLayout>
    </ProtectedRoute>
  );
}
