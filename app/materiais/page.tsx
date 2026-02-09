"use client";

import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { MaterialCard } from "@/components/materials/MaterialCard";
import { ArrowLeft } from "lucide-react";
import { is } from "date-fns/locale";

const materials = [
  {
    title: "Aprendendo Sobre a Felicidade",
    price: "R$ 4,90",
    image: "/aprendendofelicidade.webp",
    checkoutUrl: "https://go.hotmart.com/Y104296139M",
  },
  {
    title: "Arraiá da Alfabetização",
    price: "R$ 9,90",
    image: "/arraiá.webp",
    checkoutUrl: "https://go.hotmart.com/Y104296464A",
  },
  {
    title: "Caçadores de Palavras",
    price: "R$ 14,90",
    image: "/caçadoresdepalavras.webp",
    checkoutUrl: "https://go.hotmart.com/P104313409N",
    isPremium: true,
  },
  {
    title: "Girassol ☀️ e a Vida",
    price: "R$ 9,90",
    image: "/girasol_vida.webp",
    checkoutUrl: "https://go.hotmart.com/B104313490J",
    isPremium: true,
  },
  {
    title:
      "História na Caixa -  As bolinhas que Davam e Tiravam o Poder de João",
    price: "R$ 4,90",
    image: "/História.webp",
    checkoutUrl: "https://go.hotmart.com/P104313546Q",
  },
  {
    title: "Intrusos - Letra Inicial",
    price: "R$ 4,90",
    image: "/intrusos.webp",
    checkoutUrl: "https://go.hotmart.com/P104313546Q",
  },
  {
    title: "Jogo da Memória com Alfabeto",
    price: "R$ 4,90",
    image: "/jogodamemória.webp",
    checkoutUrl: "https://go.hotmart.com/Q104320776L",
  },
  {
    title: "Leitores de Palavras",
    price: "R$ 9,90",
    image: "/leitoresdepalavras.webp",
    checkoutUrl: "https://go.hotmart.com/J104322438G",
    isPremium: true,
  },
  {
    title: "Letras Iguais",
    price: "R$ 4,90",
    image: "/letrasiguais.webp",
    checkoutUrl: "https://go.hotmart.com/H104303497L",
  },
  {
    title: "Marmita da Leitura",
    price: "R$ 14,90",
    image: "/marmitadaleitura.webp",
    checkoutUrl: "https://go.hotmart.com/M104322471P",
    isPremium: true,
  },
  {
    title: "Mood Kids",
    price: "R$ 9,90",
    image: "/moodkids.webp",
    checkoutUrl: "https://go.hotmart.com/U104303566C",
    isPremium: true,
  },
  {
    title: "Não Aceitamos Fiado",
    price: "R$ 12,90",
    image: "/não_aceitamos_fiado.webp",
    checkoutUrl: "https://go.hotmart.com/L104322533M",
    isPremium: true,
  },
  {
    title: "Pipoca com Rima",
    price: "R$ 12,90",
    image: "/pipocacomrima.webp",
    checkoutUrl: "https://go.hotmart.com/T104322586Y",
    isPremium: true,
  },
  {
    title: "Termômetro das Emoções",
    price: "R$ 4,90",
    image: "/termometro.webp",
    checkoutUrl: "",
  },
  {
    title: "Varal Literário",
    price: "R$ 6,90",
    image: "/varalliterário.webp",
    checkoutUrl: "https://go.hotmart.com/K104322633D",
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
