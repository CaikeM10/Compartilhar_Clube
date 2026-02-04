"use client";

import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { MaterialCard } from "@/components/materials/MaterialCard";
import { ArrowLeft } from "lucide-react";
import { is } from "date-fns/locale";

const materials = [
  {
    title: "Girassol ☀️ e a Vida",
    price: "R$ 9,90",
    image: "/girasol_vida.webp",
    checkoutUrl: "https://pay.hotmart.com/SEU_LINK_1",
    isPremium: true,
  },
  {
    title: "Leitores de Palavras",
    price: "R$ 9,90",
    image: "/leitoresdepalavras.webp",
    checkoutUrl: "https://pay.hotmart.com/SEU_LINK_2",
  },
  {
    title: "Termômetro das Emoções",
    price: "R$ 4,90",
    image: "/termometro.webp",
    checkoutUrl: "https://pay.hotmart.com/SEU_LINK_3",
  },
  {
    title: "Marmita da Leitura",
    price: "R$ 14,90",
    image: "/marmitadaleitura.webp",
    checkoutUrl: "https://pay.hotmart.com/SEU_LINK_4",
    isPremium: true,
  },
  {
    title: "Caçadores de Palavras",
    price: "R$ 14,90",
    image: "/caçadoresdepalavras.webp",
    checkoutUrl: "https://pay.hotmart.com/SEU_LINK_5",
  },
  {
    title: "Arraiá da Alfabetização",
    price: "R$ 9,90",
    image: "/arraiá.webp",
    checkoutUrl: "https://pay.hotmart.com/SEU_LINK_6",
  },
  {
    title: "Mood Kids",
    price: "R$ 9,90",
    image: "/moodkids.webp",
    checkoutUrl: "https://pay.hotmart.com/SEU_LINK_7",
    isPremium: true,
  },
  {
    title: "Varal Literário",
    price: "R$ 6,90",
    image: "/varalliterário.webp",
    checkoutUrl: "https://pay.hotmart.com/SEU_LINK_8",
  },
  {
    title: "Pipoca com Rima",
    price: "R$ 12,90",
    image: "/pipocacomrima.webp",
    checkoutUrl: "https://pay.hotmart.com/SEU_LINK_9",
    isPremium: true,
  },
  {
    title: "Jogo da Memória com Alfabeto",
    price: "R$ 4,90",
    image: "/jogodamemória.webp",
    checkoutUrl: "https://pay.hotmart.com/SEU_LINK_10",
  },
  {
    title: "Letras Iguais",
    price: "R$ 4,90",
    image: "/letrasiguais.webp",
    checkoutUrl: "https://pay.hotmart.com/SEU_LINK_11",
  },
  {
    title: "Não Aceitamos Fiado",
    price: "R$ 12,90",
    image: "/não_aceitamos_fiado.webp",
    checkoutUrl: "https://pay.hotmart.com/SEU_LINK_12",
    isPremium: true,
  },
  {
    title: "Aprendendo Sobre a Felicidade",
    price: "R$ 4,90",
    image: "/aprendendofelicidade.webp",
    checkoutUrl: "https://pay.hotmart.com/SEU_LINK_13",
  },
];

export default function MateriaisPage() {
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
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {materials.map((item, index) => (
            <MaterialCard key={index} {...item} />
          ))}
        </div>
      </div>
    </Container>
  );
}
