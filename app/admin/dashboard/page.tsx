import { AdminLayout } from "@/components/layout/AdminLayout";
import { requirePageAccess } from "@/lib/auth/page-access";
import { getAdminDashboard } from "@/lib/admin/dashboard";
import { Card } from "@/components/ui/card";
import { Video, CalendarClock, Users, BadgeCheck } from "lucide-react";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const { user } = await requirePageAccess("admin");
  const data = await getAdminDashboard();
  const metrics = data.kind === "ready" ? [
    { label: "Alunos cadastrados", value: data.students, detail: "Contas de aluno, incluindo as desabilitadas.", icon: Users, color: "bg-primary/10 text-primary" },
    { label: "Assinaturas ativas", value: data.activeSubscriptions, detail: "Status ativo e período vigente. Contagem de assinaturas, não de pessoas.", icon: BadgeCheck, color: "bg-accent/10 text-accent" },
    { label: "Próximas do vencimento", value: data.expiringSubscriptions, detail: "Assinaturas vigentes que vencem nos próximos 7 dias.", icon: CalendarClock, color: "bg-tertiary/10 text-tertiary" },
    { label: "Aulas cadastradas", value: data.lessons, detail: `${data.publishedLessons.toLocaleString("pt-BR")} publicadas. Total inclui rascunhos e arquivadas.`, icon: Video, color: "bg-secondary/10 text-secondary" },
  ] : [];

  return (
    <AdminLayout viewer={user}>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">Painel Administrativo</h1>
          <p className="text-muted-foreground text-lg">Visão geral do Compartilhar Clube</p>
        </div>

        {data.kind === "unavailable" ? (
          <Card className="gap-3 p-6 border-primary/20" role="status">
            <h2 className="font-semibold text-primary">Indicadores indisponíveis</h2>
            <p className="text-sm text-muted-foreground">Não foi possível consultar os indicadores agora. Tente novamente em instantes.</p>
            <a href="/admin/dashboard" className="text-primary underline underline-offset-4">Tentar novamente</a>
          </Card>
        ) : (
          <section aria-label="Indicadores administrativos" className="space-y-3">
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-6">
              {metrics.map(({ label, value, detail, icon: Icon, color }) => (
                <Card key={label} className="gap-0 p-6 min-w-0">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${color}`}><Icon aria-hidden="true" className="w-6 h-6" /></div>
                  <p className="text-2xl font-bold text-primary mb-1 break-words">{value.toLocaleString("pt-BR")}</p>
                  <h2 className="text-sm font-semibold text-foreground">{label}</h2>
                  <p className="text-xs text-muted-foreground mt-2">{detail}</p>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Consultado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Fortaleza" }).format(new Date(data.checkedAt))} (Fortaleza). <a href="/admin/dashboard" className="underline underline-offset-4">Atualizar indicadores</a></p>
            <Link href="/admin/aulas" className="inline-block text-sm font-medium text-primary underline underline-offset-4">Gerenciar Aulas</Link>
          </section>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          <section aria-labelledby="activity-heading">
            <h2 id="activity-heading" className="text-xl font-bold text-primary mb-4 font-display">Atividade Recente</h2>
            <Card className="gap-0 p-6"><p className="text-sm text-muted-foreground">O histórico de atividades ainda não está disponível. Quando esse recurso for implementado, os registros aparecerão aqui.</p></Card>
          </section>
          <section aria-labelledby="feedback-heading">
            <h2 id="feedback-heading" className="text-xl font-bold text-primary mb-4 font-display">Feedback Recente</h2>
            <Card className="gap-0 p-6"><p className="text-sm text-muted-foreground">Avaliações e sugestões ainda não estão integradas a este painel.</p></Card>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
