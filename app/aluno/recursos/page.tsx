import { MemberLayout } from "@/components/layout/MemberLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Lock } from "lucide-react";

export default function RecursosPage() {
  const recursos = [
    {
      id: 1,
      title: "Atividades de Alfabetização - Pacote Completo",
      description: "50 atividades prontas para impressão",
      fileType: "pdf" as const,
      pages: 50,
      hasAccess: true,
      locked: false,
    },
    {
      id: 2,
      title: "Jogos Pedagógicos para Desenvolvimento Cognitivo",
      description: "15 jogos com instruções detalhadas",
      fileType: "pdf" as const,
      pages: 30,
      hasAccess: true,
      locked: false,
    },
    {
      id: 3,
      title: "Material de Avaliação Psicopedagógica",
      description: "Protocolos e fichas de avaliação",
      fileType: "pdf" as const,
      pages: 25,
      hasAccess: true,
      locked: false,
    },
    {
      id: 4,
      title: "Atividades para Desenvolvimento da Leitura",
      description: "Recursos para diferentes níveis de leitura",
      fileType: "pdf" as const,
      pages: 40,
      hasAccess: true,
      locked: true,
    },
    {
      id: 5,
      title: "Recursos de Estimulação Cognitiva",
      description: "Materiais para trabalhar funções executivas",
      fileType: "pdf" as const,
      pages: 35,
      hasAccess: false,
      locked: true,
    },
  ];

  return (
    <ProtectedRoute>
      <MemberLayout>
        <div className="space-y-10">
          {/* Header */}
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">
              Recursos do Compartilhar Clube
            </h1>
            <p className="text-lg text-muted-foreground">
              Materiais práticos em PDF prontos para download e uso profissional
            </p>
          </div>

          {/* Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {recursos.map((recurso) => (
              <Card
                key={recurso.id}
                className={`relative p-6 flex flex-col rounded-2xl border transition-all duration-300
                  ${
                    recurso.locked || !recurso.hasAccess
                      ? "bg-muted/40 border-border"
                      : "bg-background border-border hover:-translate-y-1 hover:shadow-xl"
                  }
                `}
              >
                {/* Top */}
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-accent/10">
                    {recurso.locked || !recurso.hasAccess ? (
                      <Lock className="w-6 h-6 text-muted-foreground" />
                    ) : (
                      <FileText className="w-6 h-6 text-accent" />
                    )}
                  </div>

                  {recurso.locked && (
                    <span className="text-xs font-medium px-3 py-1 rounded-full bg-muted text-muted-foreground">
                      Em breve
                    </span>
                  )}

                  {!recurso.hasAccess && !recurso.locked && (
                    <span className="text-xs font-medium px-3 py-1 rounded-full bg-destructive/10 text-destructive">
                      Requer assinatura
                    </span>
                  )}
                </div>

                {/* Content */}
                <h3 className="text-lg font-semibold text-primary mb-2 font-display leading-snug">
                  {recurso.title}
                </h3>

                <p className="text-sm text-muted-foreground mb-5 flex-1 leading-relaxed">
                  {recurso.description}
                </p>

                {/* Meta */}
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-6">
                  <span className="uppercase font-semibold tracking-wide">
                    PDF
                  </span>
                  <span>{recurso.pages} páginas</span>
                </div>

                {/* Action */}
                <Button
                  disabled={recurso.locked || !recurso.hasAccess}
                  className={`w-full rounded-full font-semibold transition-all
                    ${
                      recurso.locked || !recurso.hasAccess
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "bg-accent hover:bg-accent-dark text-primary shadow-md hover:shadow-lg"
                    }
                  `}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {recurso.locked
                    ? "Disponível em breve"
                    : recurso.hasAccess
                      ? "Baixar PDF"
                      : "Assinar para acessar"}
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </MemberLayout>
    </ProtectedRoute>
  );
}
