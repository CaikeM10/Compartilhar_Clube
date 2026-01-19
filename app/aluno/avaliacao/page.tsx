"use client";

import { MemberLayout } from "@/components/layout/MemberLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, ExternalLink } from "lucide-react";
import Link from "next/link";

export default function AvaliacaoPage() {
  return (
    <ProtectedRoute>
      <MemberLayout>
        <div className="max-w-4xl mx-auto py-10 space-y-10">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-3 font-display">
              Avaliação do Compartilhar Clube
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Sua opinião é fundamental para aprimorarmos conteúdos,
              experiências e a qualidade do nosso clube.
            </p>
          </div>

          {/* CTA Card */}
          <Card className="p-10 md:p-12 text-center shadow-xl border border-border">
            <div className="w-16 h-16 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-accent" />
            </div>

            <h2 className="text-2xl md:text-3xl font-bold text-primary mb-4 font-display">
              Avalie sua experiência
            </h2>

            <p className="text-muted-foreground text-lg leading-relaxed mb-10 max-w-xl mx-auto">
              Criamos um formulário rápido e objetivo para que você possa
              compartilhar sua experiência de forma prática e segura.
            </p>

            <Button
              asChild
              size="lg"
              className="bg-accent hover:bg-accent-dark text-primary font-bold text-lg px-10 py-6 rounded-full shadow-md group"
            >
              <Link
                href="https://docs.google.com/forms/d/e/1FAIpQLSfh2jonruCh4YA5nw0gbGvyIL9o-1yTO-wSGondXv-I48cVnw/viewform?usp=header "
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3"
              >
                Enviar avaliação
                <ExternalLink className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>

            <p className="mt-8 text-sm text-muted-foreground">
              Sua avaliação é confidencial e usada exclusivamente para
              melhorias.
            </p>
          </Card>
        </div>
      </MemberLayout>
    </ProtectedRoute>
  );
}
