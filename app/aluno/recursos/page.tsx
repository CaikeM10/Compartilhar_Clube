import { MemberLayout } from "@/components/layout/MemberLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Download, Lock } from "lucide-react"

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
  ]

  return (
    <ProtectedRoute>
      <MemberLayout>
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">
              Recursos do Compartilhar Clube
            </h1>
            <p className="text-muted-foreground text-lg">Materiais práticos em PDF prontos para download e uso</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recursos.map((recurso) => (
              <Card key={recurso.id} className="p-6 hover:shadow-lg transition-shadow flex flex-col">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
                  {recurso.locked ? (
                    <Lock className="w-6 h-6 text-muted-foreground" />
                  ) : (
                    <FileText className="w-6 h-6 text-accent" />
                  )}
                </div>

                <h3 className="text-lg font-semibold text-primary mb-2 font-display">{recurso.title}</h3>
                <p className="text-sm text-muted-foreground mb-4 flex-1">{recurso.description}</p>

                <div className="text-xs text-muted-foreground mb-4">
                  <span className="uppercase font-semibold">PDF</span> • {recurso.pages} páginas
                </div>

                {recurso.locked && (
                  <div className="mb-3 inline-flex items-center gap-2 bg-muted px-3 py-1.5 rounded-full text-sm text-muted-foreground">
                    <Lock className="w-4 h-4" />
                    <span>Disponível em breve</span>
                  </div>
                )}

                {!recurso.hasAccess && (
                  <div className="mb-3 inline-flex items-center gap-2 bg-destructive/10 px-3 py-1.5 rounded-full text-sm text-destructive">
                    <Lock className="w-4 h-4" />
                    <span>Requer assinatura</span>
                  </div>
                )}

                <Button
                  disabled={recurso.locked || !recurso.hasAccess}
                  className="w-full bg-accent hover:bg-accent-dark text-primary font-semibold rounded-full"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {recurso.locked ? "Em breve" : recurso.hasAccess ? "Baixar PDF" : "Assinar para acessar"}
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </MemberLayout>
    </ProtectedRoute>
  )
}
