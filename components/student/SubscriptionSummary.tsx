import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { StudentSubscription } from "@/lib/student/subscription-core";

const labels = { active: "Ativa", scheduled: "Ainda não iniciada", expired: "Expirada", inactive: "Inativa" };
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Fortaleza",
}).format(new Date(value));

export function SubscriptionSummary({ subscription }: { subscription: StudentSubscription }) {
  return (
    <Card className="p-6 border-primary/20 bg-primary/5" aria-labelledby="subscription-heading">
      <h2 id="subscription-heading" className="text-lg font-semibold text-primary font-display mb-4">Sua assinatura</h2>
      {subscription.kind === "unavailable" ? (
        <div role="status" className="text-sm text-muted-foreground space-y-3">
          <p>Não foi possível consultar sua assinatura agora. Tente novamente em instantes.</p>
          <a href="/aluno/dashboard" className="text-primary underline underline-offset-4">Tentar novamente</a>
        </div>
      ) : subscription.kind === "none" ? (
        <div className="text-sm text-muted-foreground space-y-3">
          <p>Você ainda não tem uma assinatura vigente. Os conteúdos da assinatura exigem acesso ativo.</p>
          <Link href="/clube" className="text-primary underline underline-offset-4">Conhecer o clube</Link>
        </div>
      ) : subscription.kind === "subscription" ? (
        <div className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <div className="min-w-0"><dt className="text-muted-foreground">Plano</dt><dd className="font-semibold text-primary break-words">{subscription.plan}</dd></div>
            <div><dt className="text-muted-foreground">Situação</dt><dd className="font-semibold text-primary">{labels[subscription.status]}</dd></div>
            <div><dt className="text-muted-foreground">{subscription.status === "expired" ? "Venceu em" : "Vencimento"}</dt><dd className="font-semibold text-primary"><time dateTime={subscription.expiresAt}>{date(subscription.expiresAt)}</time></dd></div>
          </dl>
          {subscription.status === "scheduled" ? <p className="text-sm text-muted-foreground">Seu acesso começa em <time dateTime={subscription.startsAt}>{date(subscription.startsAt)}</time> (horário de Fortaleza).</p>
            : subscription.status !== "active" ? <p className="text-sm text-muted-foreground">Você está sem assinatura vigente. Os conteúdos da assinatura exigem acesso ativo.</p>
              : <p className="text-sm text-muted-foreground">Sua assinatura está vigente. Produtos vendidos individualmente têm compra separada.</p>}
          <p className="text-xs text-muted-foreground">Datas no horário de Fortaleza.</p>
        </div>
      ) : null}
    </Card>
  );
}
