"use client";

import { MemberLayout } from "@/components/layout/MemberLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, ExternalLink } from "lucide-react";
import Link from "next/link";

export default function SolicitarSupervisaoPage() {
  return (
    <ProtectedRoute>
      <MemberLayout>
        <div className="max-w-3xl mx-auto py-10">
          <Card className="p-10 md:p-12 text-center shadow-xl border border-border">
            {/* Ícone */}
            <div className="w-16 h-16 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
              <ClipboardList className="w-8 h-8 text-accent" />
            </div>

            {/* Título */}
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4 font-display">
              Solicitação de Supervisão Psicopedagógica
            </h1>

            {/* Subtítulo */}
            <p className="text-lg text-muted-foreground leading-relaxed mb-10">
              As solicitações de supervisão individual são realizadas por meio
              de um formulário externo, garantindo organização, sigilo e melhor
              acompanhamento do seu caso.
            </p>

            {/* CTA */}
            <Button
              asChild
              size="lg"
              className="bg-accent hover:bg-accent-dark text-primary font-bold text-lg px-10 py-6 rounded-full shadow-md group"
            >
              <Link
                href="https://docs.google.com/forms/d/e/1FAIpQLSczkrKuMgW33OjGoEzcOgWDFW7PYExDjj1YimFlRabufPstsQ/viewform?usp=header "
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3"
              >
                Acessar formulário de solicitação
                <ExternalLink className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>

            {/* Observação */}
            <p className="mt-8 text-sm text-muted-foreground">
              Após o envio do formulário, nossa equipe analisará sua solicitação
              e entrará em contato para os próximos passos.
            </p>
          </Card>
        </div>
      </MemberLayout>
    </ProtectedRoute>
  );
}
