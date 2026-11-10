"use client";

import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { MaterialCard } from "@/components/materials/MaterialCard";
import { ArrowLeft } from "lucide-react";
import { is } from "date-fns/locale";

import { materials } from "@/lib/materials/catalog";

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
