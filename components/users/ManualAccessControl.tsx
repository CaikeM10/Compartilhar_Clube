"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { adminRequest } from "@/lib/materials/admin-client";
import { ACCESS_PERIOD_MESSAGE, defaultAccessPeriod, latestAccessEnd, userErrorMessage } from "@/lib/admin/users-client";
import {
  addDays, formatDay, grantPeriod, MANUAL_ACCESS_MAX_DAYS, renewalEnd,
  type ManualAccessView, type PaidAccessView,
} from "@/lib/admin/manual-access-rules";

const fieldClass = "block text-sm font-medium text-primary mb-1";

type Target = {
  id: string; name: string | null; email: string; disabled: boolean;
  manualAccess: ManualAccessView; paidAccess: PaidAccessView;
};
type Mode = "grant" | "renew" | "revoke";

/**
 * Grant, renew and revoke manual access for one student. Display and convenience only: the server re-checks the
 * administrator, the student, the dates (366 days at most) and the concurrency token on every request.
 */
export function ManualAccessControl({ user }: { user: Target }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const access = user.manualAccess;
  const live = access.status === "active" || access.status === "scheduled";
  const label = user.name ?? user.email;
  const today = defaultAccessPeriod().start;
  const renewBase = access.firstDay && access.firstDay > today ? access.firstDay : today;

  function open(next: Mode) {
    setError(null);
    if (next === "grant") { const period = defaultAccessPeriod(); setStart(period.start); setEnd(period.end); }
    if (next === "renew" && access.lastDay) {
      const proposed = addDays(access.lastDay, 30);
      const latest = latestAccessEnd(renewBase);
      setEnd(proposed > latest ? latest : proposed);
    }
    setMode(next);
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!mode) return;
    let body: Record<string, unknown>;
    if (mode === "grant") {
      if (!grantPeriod(start, end, new Date())) { setError(ACCESS_PERIOD_MESSAGE); return; }
      body = { action: "grant", startDate: start, endDate: end, expectedUpdatedAt: access.updatedAt };
    } else if (mode === "renew") {
      if (!access.startsAt || !access.endsAt || !renewalEnd(end, { startsAt: new Date(access.startsAt), endsAt: new Date(access.endsAt) }, new Date())) {
        setError(`Escolha um último dia posterior ao atual, com no máximo ${MANUAL_ACCESS_MAX_DAYS} dias de validade a partir de hoje.`);
        return;
      }
      body = { action: "renew", endDate: end, expectedUpdatedAt: access.updatedAt };
    } else {
      body = { action: "revoke", expectedUpdatedAt: access.updatedAt };
    }
    setBusy(true); setError(null);
    const result = await adminRequest(fetch, `/api/admin/users/${encodeURIComponent(user.id)}/access`, "POST", body);
    setBusy(false);
    if (!result.ok) { setError(userErrorMessage(result.status, result.code)); return; }
    setMode(null);
    router.refresh();
  }

  const paidWarning = user.paidAccess.status === "active" || user.paidAccess.status === "scheduled";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {live ? (
          <>
            <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={user.disabled} onClick={() => open("renew")}>Renovar acesso</Button>
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => open("revoke")}>Revogar acesso</Button>
          </>
        ) : !user.disabled && (
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => open("grant")}>Liberar acesso</Button>
        )}
      </div>
      <Dialog open={mode !== null} onOpenChange={next => { if (!next && !busy) setMode(null); }}>
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>
              {mode === "grant" ? "Liberar acesso aos conteúdos" : mode === "renew" ? "Renovar acesso" : "Revogar acesso?"}
            </DialogTitle>
            <DialogDescription>
              {mode === "revoke"
                ? `“${label}” perde a liberação manual imediatamente. Uma assinatura paga, se existir, continua válida.`
                : `Liberação administrativa para “${label}”. Nenhuma assinatura, plano ou pagamento é criado.`}
            </DialogDescription>
          </DialogHeader>
          {paidWarning && mode !== "revoke" && (
            <div role="status" className="flex items-start gap-2 rounded-lg border border-[#e1b12c]/40 bg-[#e1b12c]/10 p-3 text-sm text-foreground">
              <AlertTriangle className="w-5 h-5 text-[#b55239] flex-shrink-0" />
              <span>
                Este aluno já tem assinatura paga {user.paidAccess.status === "active" ? "vigente" : "agendada"}
                {user.paidAccess.lastDay ? ` até ${formatDay(user.paidAccess.lastDay)}` : ""}. As duas formas de acesso são independentes:
                a liberação manual não altera a assinatura.
              </span>
            </div>
          )}
          <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
            {mode === "grant" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`access-start-${user.id}`} className={fieldClass}>Início</label>
                  <Input id={`access-start-${user.id}`} type="date" required min={today} max={latestAccessEnd(today)} value={start}
                    onChange={event => setStart(event.target.value)} disabled={busy} />
                </div>
                <div>
                  <label htmlFor={`access-end-${user.id}`} className={fieldClass}>Último dia de acesso</label>
                  <Input id={`access-end-${user.id}`} type="date" required min={start || today} max={start ? latestAccessEnd(start) : undefined}
                    value={end} onChange={event => setEnd(event.target.value)} disabled={busy} />
                </div>
              </div>
            )}
            {mode === "renew" && access.lastDay && (
              <div>
                <p className="mb-2 text-sm text-muted-foreground">Último dia atual: {formatDay(access.lastDay)}.</p>
                <label htmlFor={`access-renew-${user.id}`} className={fieldClass}>Novo último dia de acesso</label>
                <Input id={`access-renew-${user.id}`} type="date" required min={addDays(access.lastDay, 1)} max={latestAccessEnd(renewBase)}
                  value={end} onChange={event => setEnd(event.target.value)} disabled={busy} />
              </div>
            )}
            {mode !== "revoke" && (
              <p className="text-xs text-muted-foreground">Até {MANUAL_ACCESS_MAX_DAYS} dias, no horário de Fortaleza. O acesso vence automaticamente.</p>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy} className="bg-accent text-primary rounded-full">{busy ? "Salvando…" : "Confirmar"}</Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setMode(null)}>Cancelar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
