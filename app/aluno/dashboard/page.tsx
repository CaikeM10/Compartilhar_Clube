import { MemberLayout } from "@/components/layout/MemberLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Video, FileText, Users, TrendingUp } from "lucide-react"
import Link from "next/link"

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <MemberLayout>
        <div className="space-y-8">
          {/* Welcome */}
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">
              Bem-vindo(a) ao Compartilhar Clube!
            </h1>
            <p className="text-muted-foreground text-lg">Seu espaço de aprendizado e crescimento profissional</p>
          </div>

          {/* Stats Cards */}
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Video className="w-6 h-6 text-primary" />
                </div>
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold text-primary mb-1">24</p>
              <p className="text-sm text-muted-foreground">Aulas disponíveis</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-accent" />
                </div>
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold text-primary mb-1">120+</p>
              <p className="text-sm text-muted-foreground">Recursos em PDF</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-tertiary/10 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-tertiary" />
                </div>
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold text-primary mb-1">8</p>
              <p className="text-sm text-muted-foreground">Supervisões agendadas</p>
            </Card>
          </div>

          {/* Quick Access */}
          <div>
            <h2 className="text-2xl font-bold text-primary mb-6 font-display">Acesso Rápido</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Video className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-primary mb-2 font-display">Aulas 2026</h3>
                <p className="text-sm text-muted-foreground mb-4">Acesse as aulas gravadas e o conteúdo de formação</p>
                <Button asChild className="w-full bg-primary hover:bg-primary/90 text-white rounded-full">
                  <Link href="/aluno/aulas">Ver aulas</Link>
                </Button>
              </Card>

              <Card className="p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
                  <FileText className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-lg font-semibold text-primary mb-2 font-display">Recursos PDF</h3>
                <p className="text-sm text-muted-foreground mb-4">Materiais práticos prontos para usar</p>
                <Button
                  asChild
                  variant="outline"
                  className="w-full border-accent text-accent hover:bg-accent hover:text-primary rounded-full bg-transparent"
                >
                  <Link href="/aluno/recursos">Baixar recursos</Link>
                </Button>
              </Card>

              <Card className="p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-tertiary/10 rounded-lg flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-tertiary" />
                </div>
                <h3 className="text-lg font-semibold text-primary mb-2 font-display">Supervisões</h3>
                <p className="text-sm text-muted-foreground mb-4">Participe das supervisões em grupo</p>
                <Button
                  asChild
                  variant="outline"
                  className="w-full border-tertiary text-tertiary hover:bg-tertiary hover:text-white rounded-full bg-transparent"
                >
                  <Link href="/aluno/supervisoes">Ver supervisões</Link>
                </Button>
              </Card>
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <h2 className="text-2xl font-bold text-primary mb-6 font-display">Últimas Atualizações</h2>
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-4 pb-4 border-b border-border last:border-0 last:pb-0">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Video className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground mb-1">Nova aula disponível</h4>
                    <p className="text-sm text-muted-foreground mb-1">
                      Aula: Desenvolvimento Cognitivo na Primeira Infância
                    </p>
                    <p className="text-xs text-muted-foreground">Há 2 dias</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 pb-4 border-b border-border last:border-0 last:pb-0">
                  <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-accent" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground mb-1">Novos recursos adicionados</h4>
                    <p className="text-sm text-muted-foreground mb-1">15 novos PDFs disponíveis para download</p>
                    <p className="text-xs text-muted-foreground">Há 5 dias</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-tertiary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-tertiary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground mb-1">Supervisão agendada</h4>
                    <p className="text-sm text-muted-foreground mb-1">Próxima supervisão em grupo: 15/01/2026</p>
                    <p className="text-xs text-muted-foreground">Há 1 semana</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </MemberLayout>
    </ProtectedRoute>
  )
}
