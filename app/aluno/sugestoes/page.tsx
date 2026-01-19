"use client";

import { MemberLayout } from "@/components/layout/MemberLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lightbulb, ExternalLink } from "lucide-react";
import Link from "next/link";

export default function SugestoesPage() {
  return (
    <ProtectedRoute>
      <MemberLayout>
        <div className="max-w-4xl mx-auto py-10 space-y-10">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-3 font-display">
              Sugestões para o Compartilhar Clube
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Suas ideias nos ajudam a evoluir continuamente. Compartilhe
              sugestões, melhorias e propostas para fortalecer ainda mais nossa
              comunidade.
            </p>
          </div>

          {/* CTA Card */}
          <Card className="p-10 md:p-12 text-center shadow-xl border border-border">
            <div className="w-16 h-16 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
              <Lightbulb className="w-8 h-8 text-accent" />
            </div>

            <h2 className="text-2xl md:text-3xl font-bold text-primary mb-4 font-display">
              Compartilhe sua ideia
            </h2>

            <p className="text-muted-foreground text-lg leading-relaxed mb-10 max-w-xl mx-auto">
              Criamos um formulário externo para organizar melhor as sugestões e
              garantir que todas sejam analisadas com atenção e carinho.
            </p>

            <Button
              asChild
              size="lg"
              className="bg-accent hover:bg-accent-dark text-primary font-bold text-lg px-10 py-6 rounded-full shadow-md group"
            >
              <Link
                href="https://docs.google.com/forms/d/e/1FAIpQLSfh2jonruCh4YA5nw0gbGvyIL9o-1yTO-wSGondXv-I48cVnw/viewform"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3"
              >
                Enviar sugestão
                <ExternalLink className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>

            <p className="mt-8 text-sm text-muted-foreground">
              Todas as sugestões são lidas e consideradas com responsabilidade.
            </p>
          </Card>

          {/* Tipos de Sugestões */}
          <Card className="p-8 bg-muted/30">
            <h3 className="text-lg font-semibold text-primary mb-4 font-display">
              Tipos de sugestões que adoramos receber
            </h3>

            <ul className="grid md:grid-cols-2 gap-3 text-muted-foreground text-sm">
              <li>• Temas para novas aulas e formações</li>
              <li>• Recursos e materiais que você gostaria de acessar</li>
              <li>• Melhorias na plataforma ou na organização do conteúdo</li>
              <li>• Novas funcionalidades ou serviços</li>
              <li>• Ideias para eventos e encontros da comunidade</li>
              <li>• Sugestões para fortalecer a troca entre os membros</li>
            </ul>
          </Card>
        </div>
      </MemberLayout>
    </ProtectedRoute>
  );
}
