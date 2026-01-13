import { MemberLayout } from "@/components/layout/MemberLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Users, Calendar, Clock, MapPin } from "lucide-react"
import Link from "next/link"

export default function SupervisoesPage() {
  const supervisoes = [
    {
      id: 1,
      title: "Supervisão em Grupo - Casos Clínicos",
      type: "group" as const,
      date: "2026-01-15",
      time: "19:00",
      duration: "90 min",
      location: "Online (Zoom)",
      description: "Discussão de casos clínicos com foco em intervenções psicopedagógicas",
      profession: "Todos os profissionais",
    },
    {
      id: 2,
      title: "Supervisão - Alfabetização e Letramento",
      type: "group" as const,
      date: "2026-01-22",
      time: "19:00",
      duration: "60 min",
      location: "Online (Zoom)",
      description: "Estratégias práticas para desafios em alfabetização",
      profession: "Professores e Psicopedagogos",
    },
    {
      id: 3,
      title: "Supervisão Psicológica - Casos Exclusivos",
      type: "group" as const,
      date: "2026-01-29",
      time: "20:00",
      duration: "90 min",
      location: "Online (Zoom)",
      description: "Estudos de caso da clínica psicológica (exclusivo para psicólogos)",
      profession: "Psicólogos",
    },
  ]

  return (
    <ProtectedRoute>
      <MemberLayout>
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">
                Supervisões de Caso em Grupo
              </h1>
              <p className="text-muted-foreground text-lg">
                Encontros online para discussão de casos e compartilhamento de experiências
              </p>
            </div>
            <Button asChild className="bg-accent hover:bg-accent-dark text-primary font-semibold rounded-full">
              <Link href="/aluno/solicitar-supervisao">Solicitar Supervisão PP</Link>
            </Button>
          </div>

          <div className="grid gap-6">
            {supervisoes.map((supervisao) => (
              <Card key={supervisao.id} className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Icon */}
                  <div className="w-16 h-16 bg-tertiary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Users className="w-8 h-8 text-tertiary" />
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-3">
                      <div>
                        <h3 className="text-xl font-semibold text-primary mb-1 font-display">{supervisao.title}</h3>
                        <p className="text-sm text-muted-foreground">{supervisao.profession}</p>
                      </div>
                      <span className="inline-flex items-center gap-2 bg-muted px-3 py-1.5 rounded-full text-sm font-medium text-foreground">
                        {supervisao.type === "group" ? "Grupo" : "Individual"}
                      </span>
                    </div>

                    <p className="text-muted-foreground mb-4">{supervisao.description}</p>

                    <div className="grid md:grid-cols-3 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span>
                          {new Date(supervisao.date).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-4 h-4 text-primary" />
                        <span>
                          {supervisao.time} ({supervisao.duration})
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-4 h-4 text-primary" />
                        <span>{supervisao.location}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Card className="p-6 bg-muted/30">
            <h3 className="text-lg font-semibold text-primary mb-3 font-display">Observação Ética Importante</h3>
            <p className="text-muted-foreground leading-relaxed">
              As supervisões de casos clínicos da psicologia são <strong>exclusivas para psicólogos</strong>,
              respeitando o sigilo profissional e o código de ética da profissão. Outras supervisões são abertas para
              todos os membros do clube.
            </p>
          </Card>
        </div>
      </MemberLayout>
    </ProtectedRoute>
  )
}
