"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CalendarCheck, CheckCircle, KeyRound, UserPlus } from "lucide-react";
import { adminRequest } from "@/lib/materials/admin-client";
import {
  buildCreateUserPayload, defaultAccessPeriod, generateInitialPassword, latestAccessEnd, userErrorMessage, UserFormError,
} from "@/lib/admin/users-client";
import { formatDay, MANUAL_ACCESS_MAX_DAYS } from "@/lib/admin/manual-access-rules";
import { PASSWORD_MAX, PASSWORD_MIN, type RequestedRole } from "@/lib/admin/user-validation";

const fieldClass = "block text-sm font-medium text-primary mb-1";
const selectClass = "border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50 md:text-sm";

type Created = { name: string; role: RequestedRole; priorApprovedPayments: number; accessLastDay: string | null };
type CreatedResponse = { priorApprovedPayments: number; user: { manualAccess: { lastDay: string | null } } };

/** `canCreateAdmin` only shapes the form; the server decides from the database who may create administrators. */
export function NewUserDialog({ canCreateAdmin }: { canCreateAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [role, setRole] = useState<RequestedRole>("student");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [grantAccess, setGrantAccess] = useState(false);
  const [accessStart, setAccessStart] = useState(() => defaultAccessPeriod().start);
  const [accessEnd, setAccessEnd] = useState(() => defaultAccessPeriod().end);

  function reset() {
    setError(null); setCreated(null); setRole("student"); setPassword(""); setConfirmation(""); setVisible(false);
    const period = defaultAccessPeriod();
    setGrantAccess(false); setAccessStart(period.start); setAccessEnd(period.end);
  }

  function generate() {
    const value = generateInitialPassword();
    setPassword(value); setConfirmation(value); setVisible(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let payload;
    try {
      payload = buildCreateUserPayload({
        name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), role, password, confirmation,
        grantAccess, accessStart, accessEnd,
      }, canCreateAdmin);
    } catch (problem) {
      setError(problem instanceof UserFormError ? problem.message : "Revise os dados informados.");
      return;
    }
    setBusy(true); setError(null);
    const result = await adminRequest<CreatedResponse>(fetch, "/api/admin/users", "POST", payload);
    setBusy(false);
    if (!result.ok) { setError(userErrorMessage(result.status, result.code)); return; }
    // The initial password is dropped from memory as soon as the account exists.
    setPassword(""); setConfirmation(""); setVisible(false);
    setCreated({
      name: payload.name, role: payload.role, priorApprovedPayments: result.data.priorApprovedPayments,
      accessLastDay: result.data.user?.manualAccess?.lastDay ?? null,
    });
    router.refresh();
  }

  const effectiveRole: RequestedRole = canCreateAdmin && role === "admin" ? "admin" : "student";
  const minimum = PASSWORD_MIN[effectiveRole];
  const today = defaultAccessPeriod().start;

  return (
    <>
      <Button onClick={() => { reset(); setOpen(true); }} className="bg-accent text-primary rounded-full">
        <UserPlus className="w-4 h-4" />
        Novo usuário
      </Button>
      <Dialog open={open} onOpenChange={next => { if (!next && !busy) { reset(); setOpen(false); } }}>
        <DialogContent showCloseButton={!busy} className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{created ? "Conta criada" : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              {created
                ? "A senha inicial deve ser trocada no primeiro acesso."
                : canCreateAdmin
                  ? "Cadastre um aluno ou um administrador comum. Nenhuma assinatura, plano ou pagamento é criado."
                  : "Cadastre um aluno. Nenhuma assinatura, plano ou pagamento é criado."}
            </DialogDescription>
          </DialogHeader>

          {created ? (
            <div className="space-y-4" aria-live="polite">
              <p className="flex items-start gap-2 text-sm text-foreground">
                <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                <span>
                  {created.name} foi cadastrado como {created.role === "admin" ? "administrador" : "aluno"}. Envie a senha inicial
                  por um canal seguro; no primeiro acesso será obrigatório trocá-la.
                </span>
              </p>
              {created.accessLastDay && (
                <p className="flex items-start gap-2 text-sm text-foreground">
                  <CalendarCheck className="w-5 h-5 text-primary flex-shrink-0" />
                  <span>Acesso aos conteúdos liberado até {formatDay(created.accessLastDay)} (horário de Fortaleza). Nenhuma assinatura foi criada.</span>
                </p>
              )}
              {created.priorApprovedPayments > 0 && (
                <div role="status" className="flex items-start gap-2 rounded-lg border border-[#e1b12c]/40 bg-[#e1b12c]/10 p-3 text-sm text-foreground">
                  <AlertTriangle className="w-5 h-5 text-[#b55239] flex-shrink-0" />
                  <span>
                    Existe{created.priorApprovedPayments > 1 ? "m" : ""} {created.priorApprovedPayments} pagamento{created.priorApprovedPayments > 1 ? "s" : ""} aprovado{created.priorApprovedPayments > 1 ? "s" : ""} registrado{created.priorApprovedPayments > 1 ? "s" : ""} com este e-mail.
                    Isso não comprova a titularidade e nenhuma assinatura foi criada ou vinculada. Confira antes de liberar qualquer acesso pago.
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={reset} className="bg-accent text-primary rounded-full">Cadastrar outro</Button>
                <Button type="button" variant="outline" onClick={() => { reset(); setOpen(false); }}>Fechar</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" aria-busy={busy} autoComplete="off">
              <div><label htmlFor="user-name" className={fieldClass}>Nome</label><Input id="user-name" name="name" required minLength={2} maxLength={100} disabled={busy} /></div>
              <div><label htmlFor="user-email" className={fieldClass}>E-mail</label><Input id="user-email" name="email" type="email" required maxLength={254} disabled={busy} /></div>
              {canCreateAdmin && (
                <div>
                  <label htmlFor="user-role" className={fieldClass}>Tipo de conta</label>
                  <select id="user-role" value={role} onChange={event => setRole(event.target.value === "admin" ? "admin" : "student")} disabled={busy} className={selectClass}>
                    <option value="student">Aluno</option>
                    <option value="admin">Administrador comum</option>
                  </select>
                </div>
              )}
              {effectiveRole === "student" && (
                <fieldset className="space-y-3 rounded-lg border border-primary/15 p-3">
                  <div className="flex items-center gap-2">
                    <input id="user-grant-access" type="checkbox" checked={grantAccess} onChange={event => setGrantAccess(event.target.checked)} disabled={busy} className="h-4 w-4 accent-primary" />
                    <label htmlFor="user-grant-access" className="text-sm font-medium text-primary">Liberar acesso aos conteúdos</label>
                  </div>
                  {grantAccess && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor="user-access-start" className={fieldClass}>Início</label>
                          <Input id="user-access-start" type="date" required min={today} max={latestAccessEnd(today)} value={accessStart}
                            onChange={event => setAccessStart(event.target.value)} disabled={busy} />
                        </div>
                        <div>
                          <label htmlFor="user-access-end" className={fieldClass}>Último dia de acesso</label>
                          <Input id="user-access-end" type="date" required min={accessStart || today} max={accessStart ? latestAccessEnd(accessStart) : undefined}
                            value={accessEnd} onChange={event => setAccessEnd(event.target.value)} disabled={busy} />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Até {MANUAL_ACCESS_MAX_DAYS} dias, no horário de Fortaleza. Vence automaticamente e pode ser renovada ou revogada.
                        Nenhuma assinatura, plano ou pagamento é criado.
                      </p>
                    </>
                  )}
                </fieldset>
              )}
              <div>
                <label htmlFor="user-password" className={fieldClass}>Senha inicial</label>
                <div className="flex gap-2">
                  <Input id="user-password" type={visible ? "text" : "password"} required minLength={minimum} maxLength={PASSWORD_MAX}
                    autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
                  <Button type="button" variant="outline" onClick={generate} disabled={busy} title="Gerar senha aleatória">
                    <KeyRound className="w-4 h-4" />
                    Gerar
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">De {minimum} a {PASSWORD_MAX} caracteres. A pessoa deverá trocá-la no primeiro acesso.</p>
              </div>
              <div>
                <label htmlFor="user-password-confirmation" className={fieldClass}>Confirmar senha inicial</label>
                <Input id="user-password-confirmation" type={visible ? "text" : "password"} required maxLength={PASSWORD_MAX}
                  autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} />
              </div>
              <div className="flex items-center gap-2">
                <input id="user-password-visible" type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} disabled={busy} className="h-4 w-4 accent-primary" />
                <label htmlFor="user-password-visible" className="text-sm text-primary">Mostrar senha</label>
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy} className="bg-accent text-primary rounded-full">{busy ? "Cadastrando…" : "Cadastrar"}</Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => { reset(); setOpen(false); }}>Cancelar</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
