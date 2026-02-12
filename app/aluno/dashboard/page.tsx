import { MemberLayout } from "@/components/layout/MemberLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Video,
  FileText,
  Users,
  TrendingUp,
  Sparkles,
  Clock,
} from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <MemberLayout>
        <div className="space-y-10">
          {/* Welcome */}
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">
              Bem-vindo(a) ao Compartilhar Clube!
            </h1>
            <p className="text-muted-foreground text-lg">
              Veja o que preparamos para você esta semana 👇
            </p>
          </div>

          {/* Novidades da Semana */}
          <Card className="p-6 border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-primary font-display">
                Novidades da semana
              </h2>
            </div>

            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                🎥 Nova aula adicionada:{" "}
                <strong>Desenvolvimento Cognitivo Infantil</strong>
              </li>
              <li>📄 15 novos materiais PDF disponíveis</li>
              <li>
                👥 Próxima supervisão em grupo:{" "}
                <strong>15/01/2026 às 19h</strong>
              </li>
            </ul>
          </Card>

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
              <p className="text-sm text-muted-foreground">
                Aulas disponíveis{" "}
                <span className="block text-xs">+3 novas este mês</span>
              </p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-accent" />
                </div>
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold text-primary mb-1">120+</p>
              <p className="text-sm text-muted-foreground">
                Recursos em PDF{" "}
                <span className="block text-xs">Atualizados semanalmente</span>
              </p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-tertiary/10 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-tertiary" />
                </div>
                <Clock className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold text-primary mb-1">8</p>
              <p className="text-sm text-muted-foreground">
                Supervisões agendadas{" "}
                <span className="block text-xs">Vagas limitadas</span>
              </p>
            </Card>
          </div>

          {/* Recomendado */}
          <Card className="p-6 border-accent/30 bg-accent/5">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-semibold text-primary font-display">
                Veja a aula em destaque da semana!
              </h2>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Comece pela aula mais recente e avance no seu desenvolvimento.
            </p>

            <Button
              asChild
              className="bg-accent hover:bg-accent-dark text-primary rounded-full"
            >
              <Link href="/aluno/aulas">Assistir aula recomendada</Link>
            </Button>
          </Card>

          {/* Acesso Rápido */}
          <div>
            <h2 className="text-2xl font-bold text-primary mb-6 font-display">
              Acesso Rápido
            </h2>
            9
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Video className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-primary mb-2 font-display">
                  Aulas 2026
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Acesse as aulas gravadas e conteúdos atualizados
                </p>
                <Button
                  asChild
                  className="w-full bg-primary hover:bg-primary/90 text-white rounded-full"
                >
                  <Link href="/aluno/aulas">Ver aulas</Link>
                </Button>
              </Card>

              <Card className="p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
                  <FileText className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-lg font-semibold text-primary mb-2 font-display">
                  Recursos PDF
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Materiais práticos prontos para aplicar
                </p>
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
                <h3 className="text-lg font-semibold text-primary mb-2 font-display">
                  Supervisões
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Participe das supervisões em grupo
                </p>
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
        </div>
      </MemberLayout>
    </ProtectedRoute>
  );
}
