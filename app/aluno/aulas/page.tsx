import { MemberLayout } from "@/components/layout/MemberLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Video, Clock, Lock, Play } from "lucide-react"

export default function AulasPage() {
  const aulas = [
    {
      id: 1,
      title: "Introdução ao Compartilhar Clube",
      description: "Conheça a plataforma e como aproveitar ao máximo",
      duration: "15 min",
      hasAccess: true,
      locked: false,
    },
    {
      id: 2,
      title: "Desenvolvimento Cognitivo na Primeira Infância",
      description: "Principais marcos e como estimular o desenvolvimento",
      duration: "45 min",
      hasAccess: true,
      locked: false,
    },
    {
      id: 3,
      title: "Estratégias de Alfabetização",
      description: "Métodos práticos para o processo de alfabetização",
      duration: "60 min",
      hasAccess: true,
      locked: false,
    },
    {
      id: 4,
      title: "Neuropsicopedagogia Aplicada",
      description: "Fundamentos e aplicações práticas",
      duration: "50 min",
      hasAccess: true,
      locked: true,
    },
    {
      id: 5,
      title: "Avaliação Psicopedagógica",
      description: "Técnicas e instrumentos de avaliação",
      duration: "55 min",
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
              Aulas do Compartilhar Clube 2026
            </h1>
            <p className="text-muted-foreground text-lg">
              Conteúdo de formação continuada para sua prática profissional
            </p>
          </div>

          <div className="grid gap-6">
            {aulas.map((aula) => (
              <Card key={aula.id} className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex flex-col md:flex-row gap-6">
                  {/* Thumbnail */}
                  <div className="relative w-full md:w-64 h-40 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                    {aula.locked ? (
                      <Lock className="w-12 h-12 text-white/80" />
                    ) : (
                      <Play className="w-16 h-16 text-white/80" />
                    )}
                    <div className="absolute bottom-3 right-3 bg-black/70 px-2 py-1 rounded text-white text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {aula.duration}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 flex flex-col">
                    <div className="flex-1">
                      <div className="flex items-start gap-3 mb-2">
                        <Video className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold text-primary mb-1 font-display">{aula.title}</h3>
                          <p className="text-muted-foreground">{aula.description}</p>
                        </div>
                      </div>

                      {aula.locked && (
                        <div className="mt-3 inline-flex items-center gap-2 bg-muted px-3 py-1.5 rounded-full text-sm text-muted-foreground">
                          <Lock className="w-4 h-4" />
                          <span>Disponível em breve</span>
                        </div>
                      )}

                      {!aula.hasAccess && (
                        <div className="mt-3 inline-flex items-center gap-2 bg-destructive/10 px-3 py-1.5 rounded-full text-sm text-destructive">
                          <Lock className="w-4 h-4" />
                          <span>Requer assinatura ativa</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4">
                      <Button
                        disabled={aula.locked || !aula.hasAccess}
                        className="bg-accent hover:bg-accent-dark text-primary font-semibold rounded-full"
                      >
                        {aula.locked ? "Em breve" : aula.hasAccess ? "Assistir aula" : "Assinar para acessar"}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </MemberLayout>
    </ProtectedRoute>
  )
}
