import { Card } from "@/components/ui/card";
import type { StudentManualAccess } from "@/lib/student/manual-access-core";
import { formatDay } from "@/lib/admin/manual-access-rules";

/** Administrative access shown apart from the paid subscription. Nothing is rendered when there was never a grant. */
export function ManualAccessSummary({ access }: { access: StudentManualAccess }) {
  if (access.kind === "none") return null;
  return (
    <Card className="gap-3 p-6 border-primary/20" aria-labelledby="manual-access-heading">
      <h2 id="manual-access-heading" className="text-lg font-semibold text-primary font-display">Acesso liberado pela equipe</h2>
      {access.kind === "unavailable" ? (
        <p className="text-sm text-muted-foreground">Não foi possível consultar a liberação de acesso agora. Tente novamente em instantes.</p>
      ) : access.status === "active" ? (
        <p className="text-sm text-muted-foreground">
          Seus conteúdos estão liberados até <strong className="text-primary">{formatDay(access.lastDay)}</strong> (horário de Fortaleza).
          Esta liberação é independente da assinatura e não gera cobrança.
        </p>
      ) : access.status === "scheduled" ? (
        <p className="text-sm text-muted-foreground">
          Sua liberação começa em <strong className="text-primary">{formatDay(access.firstDay)}</strong> e vai até{" "}
          <strong className="text-primary">{formatDay(access.lastDay)}</strong> (horário de Fortaleza).
        </p>
      ) : access.status === "expired" ? (
        <p className="text-sm text-muted-foreground">Sua liberação de acesso terminou em {formatDay(access.lastDay)}.</p>
      ) : (
        <p className="text-sm text-muted-foreground">Sua liberação de acesso foi encerrada pela equipe.</p>
      )}
    </Card>
  );
}
