import { AdminLayout } from "@/components/layout/AdminLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { Card } from "@/components/ui/card"
import { Video, FileText, Users, Activity } from "lucide-react"

export default function AdminDashboardPage() {
  return (
    <ProtectedRoute requireAdmin>
      <AdminLayout>
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">Painel Administrativo</h1>
            <p className="text-muted-foreground text-lg">Visão geral do Compartilhar Clube</p>
          </div>

          {/* Stats */}
          <div className="grid md:grid-cols-4 gap-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-primary" />
                </div>
              </div>
              <p className="text-2xl font-bold text-primary mb-1">156</p>
              <p className="text-sm text-muted-foreground">Membros ativos</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                  <Video className="w-6 h-6 text-accent" />
                </div>
              </div>
              <p className="text-2xl font-bold text-primary mb-1">24</p>
              <p className="text-sm text-muted-foreground">Aulas cadastradas</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <div className="w-12 h-12 bg-tertiary/10 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-tertiary" />
                </div>
              </div>
              <p className="text-2xl font-bold text-primary mb-1">120</p>
              <p className="text-sm text-muted-foreground">Recursos disponíveis</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
                  <Activity className="w-6 h-6 text-secondary" />
                </div>
              </div>
              <p className="text-2xl font-bold text-primary mb-1">89%</p>
              <p className="text-sm text-muted-foreground">Taxa de engajamento</p>
            </Card>
          </div>

          {/* Recent Activity */}
          <div className="grid lg:grid-cols-2 gap-8">
            <div>
              <h2 className="text-xl font-bold text-primary mb-4 font-display">Atividade Recente</h2>
              <Card className="p-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3 pb-4 border-b border-border last:border-0 last:pb-0">
                    <div className="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                    <div>
                      <p className="text-sm font-medium text-foreground">15 novos usuários se cadastraram</p>
                      <p className="text-xs text-muted-foreground">Há 2 horas</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 pb-4 border-b border-border last:border-0 last:pb-0">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Nova aula publicada</p>
                      <p className="text-xs text-muted-foreground">Há 5 horas</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 pb-4 border-b border-border last:border-0 last:pb-0">
                    <div className="w-2 h-2 bg-tertiary rounded-full mt-2 flex-shrink-0"></div>
                    <div>
                      <p className="text-sm font-medium text-foreground">8 recursos baixados</p>
                      <p className="text-xs text-muted-foreground">Há 1 dia</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <div>
              <h2 className="text-xl font-bold text-primary mb-4 font-display">Feedback Recente</h2>
              <Card className="p-6">
                <div className="space-y-4">
                  <div className="pb-4 border-b border-border last:border-0 last:pb-0">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-sm font-medium text-foreground">Maria Silva</p>
                      <span className="text-xs text-muted-foreground">Avaliação: 5/5</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      "Conteúdo excepcional! As aulas são muito práticas e aplicáveis."
                    </p>
                  </div>
                  <div className="pb-4 border-b border-border last:border-0 last:pb-0">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-sm font-medium text-foreground">João Santos</p>
                      <span className="text-xs text-muted-foreground">Sugestão</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      "Seria ótimo ter mais aulas sobre neuropsicopedagogia."
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  )
}
