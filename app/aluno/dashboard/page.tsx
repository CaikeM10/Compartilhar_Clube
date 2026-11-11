import { MemberLayout } from "@/components/layout/MemberLayout";
import { requirePageAccess } from "@/lib/auth/page-access";
import { getStudentSubscription } from "@/lib/student/subscription";
import { SubscriptionSummary } from "@/components/student/SubscriptionSummary";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Video,
  FileText,
  Users,
  Sparkles,
  Clock,
} from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const { user } = await requirePageAccess("account");
  const subscription = await getStudentSubscription();
  const name = user.name?.trim();
  return (
    <>
      <MemberLayout viewer={user}>
        <div className="space-y-6">
          {/* Welcome */}
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display break-words">
              {name ? `Bem-vindo(a), ${name}!` : "Bem-vindo(a) ao Compartilhar Clube!"}
            </h1>
            <p className="text-muted-foreground text-lg">
              Acompanhe sua assinatura e os conteúdos do clube.
            </p>
          </div>

          <SubscriptionSummary subscription={subscription} />

          {/* Novidades da Semana */}
          <Card className="gap-0 p-5 sm:p-6 border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-primary font-display">
                Novidades da semana
              </h2>
            </div>

            <p className="text-sm text-muted-foreground">
              Quando houver novidades disponíveis neste painel, você poderá acompanhá-las aqui.
            </p>
          </Card>

          {/* Stats Cards */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="gap-0 p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Video className="w-6 h-6 text-primary" />
                </div>
              </div>
              <p className="text-2xl font-bold text-primary mb-1">Aulas do clube</p>
              <p className="text-sm text-muted-foreground">
                Aulas da assinatura
                <span className="block text-xs">Confira as aulas publicadas na área de aulas.</span>
              </p>
            </Card>

            <Card className="gap-0 p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-accent" />
                </div>
              </div>
              <p className="text-2xl font-bold text-primary mb-1">Materiais incluídos</p>
              <p className="text-sm text-muted-foreground">
                Biblioteca de Materiais
                <span className="block text-xs">O mesmo catálogo da vitrine faz parte da assinatura ativa. O acesso aos arquivos pela biblioteca está em preparação.</span>
              </p>
            </Card>

            <Card className="gap-0 p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-tertiary/10 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-tertiary" />
                </div>
                <Clock className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold text-primary mb-1">Sem agenda disponível</p>
              <p className="text-sm text-muted-foreground">
                Supervisões
                <span className="block text-xs">Os próximos encontros serão informados quando a agenda estiver disponível.</span>
              </p>
            </Card>
          </div>

          {/* Destaque oculto até existir uma seleção persistida de aula publicada. */}
          <div>
            <h2 className="text-2xl font-bold text-primary mb-4 font-display">Acesso Rápido</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="gap-0 p-5 sm:p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4"><Video className="w-6 h-6 text-primary" /></div>
                <h3 className="text-lg font-semibold text-primary mb-2 font-display">Aulas da assinatura</h3>
                <p className="text-sm text-muted-foreground mb-4">Consulte a área de aulas do clube</p>
                <Button asChild className="mt-auto w-full bg-primary hover:bg-primary/90 text-white rounded-full"><Link href="/aluno/aulas">Ver aulas</Link></Button>
              </Card>
              <Card className="gap-0 p-5 sm:p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4"><FileText className="w-6 h-6 text-accent" /></div>
                <h3 className="text-lg font-semibold text-primary mb-2 font-display">Biblioteca de Materiais</h3>
                <p className="text-sm text-muted-foreground mb-4">Com assinatura ativa, os materiais do catálogo estão incluídos, sem pagar novamente. Quem não assina pode comprar individualmente.</p>
                <Button asChild variant="outline" className="mt-auto w-full h-auto min-h-9 whitespace-normal text-center py-2 border-accent text-accent hover:bg-accent hover:text-primary rounded-full bg-transparent"><Link href="/materiais">Explorar Biblioteca de Materiais</Link></Button>
              </Card>
              <Card className="gap-0 p-5 sm:p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-tertiary/10 rounded-lg flex items-center justify-center mb-4"><Users className="w-6 h-6 text-tertiary" /></div>
                <h3 className="text-lg font-semibold text-primary mb-2 font-display">Supervisões</h3>
                <p className="text-sm text-muted-foreground mb-4">Consulte a área de supervisões do clube</p>
                <Button asChild variant="outline" className="mt-auto w-full border-tertiary text-tertiary hover:bg-tertiary hover:text-white rounded-full bg-transparent"><Link href="/aluno/supervisoes">Ver supervisões</Link></Button>
              </Card>
            </div>
          </div>
        </div>
      </MemberLayout>
    </>
  );
}

