import { MemberLayout } from "@/components/layout/MemberLayout";
import { requirePageAccess } from "@/lib/auth/page-access";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Calendar, Clock, MapPin } from "lucide-react";
import Link from "next/link";

export default async function SupervisoesPage() {
  const { user } = await requirePageAccess("subscriber");
  const supervisoes = [
    {
      id: 1,
      title: "Supervisão em Grupo – Casos Clínicos",
      type: "group" as const,
      date: "2026-01-15",
      time: "19:00",
      duration: "90 min",
      location: "Online (Zoom)",
      description:
        "Discussão de casos clínicos com foco em intervenções psicopedagógicas.",
      profession: "Todos os profissionais",
    },
    {
      id: 2,
      title: "Supervisão – Alfabetização e Letramento",
      type: "group" as const,
      date: "2026-01-22",
      time: "19:00",
      duration: "60 min",
      location: "Online (Zoom)",
      description:
        "Estratégias práticas para desafios em alfabetização e letramento.",
      profession: "Professores e Psicopedagogos",
    },
    {
      id: 3,
      title: "Supervisão Psicológica – Casos Exclusivos",
      type: "group" as const,
      date: "2026-01-29",
      time: "20:00",
      duration: "90 min",
      location: "Online (Zoom)",
      description:
        "Estudos de caso da clínica psicológica (exclusivo para psicólogos).",
      profession: "Psicólogos",
    },
  ];

  return (
    <>
      <MemberLayout viewer={user}>
        <div className="space-y-10">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">
                Supervisões em Grupo
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl">
                Encontros online para troca de experiências, discussão de casos
                reais e aprofundamento profissional.
              </p>
            </div>

            <Button
              asChild
              size="lg"
              className="bg-accent hover:bg-accent-dark text-primary font-semibold rounded-full px-8 shadow-md"
            >
              <Link href="/aluno/solicitar-supervisao">
                Solicitar Supervisão PP
              </Link>
            </Button>
          </div>

          {/* Lista de supervisões */}
          <div className="grid gap-6">
            {supervisoes.map((supervisao) => (
              <Card
                key={supervisao.id}
                className="p-6 md:p-8 transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
              >
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Icon */}
                  <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Users className="w-7 h-7 text-primary" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <h3 className="text-xl md:text-2xl font-semibold text-primary font-display">
                          {supervisao.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {supervisao.profession}
                        </p>
                      </div>

                      <span className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium">
                        🧑‍🤝‍🧑 Grupo
                      </span>
                    </div>

                    <p className="text-muted-foreground leading-relaxed">
                      {supervisao.description}
                    </p>

                    {/* Meta info */}
                    <div className="grid md:grid-cols-3 gap-4 text-sm pt-2">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span>
                          {new Date(supervisao.date).toLocaleDateString(
                            "pt-BR",
                            {
                              day: "2-digit",
                              month: "long",
                              year: "numeric",
                            },
                          )}
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

                    {/* CTA */}
                    <div className="pt-4">
                      <Button
                        size="sm"
                        className="bg-primary hover:bg-primary/90 text-white rounded-full px-6"
                      >
                        Participar da supervisão
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Observação ética */}
          <Card className="p-6 md:p-8 bg-muted/40 border-l-4 border-primary">
            <h3 className="text-lg font-semibold text-primary mb-3 font-display flex items-center gap-2">
              Observação Ética Importante
            </h3>
            <p className="text-muted-foreground leading-relaxed max-w-4xl">
              As supervisões de casos clínicos da psicologia são{" "}
              <strong>exclusivas para psicólogos</strong>, respeitando o sigilo
              profissional e o código de ética da profissão. As demais
              supervisões são abertas a todos os membros do Compartilhar Clube.
            </p>
          </Card>
        </div>
      </MemberLayout>
    </>
  );
}
