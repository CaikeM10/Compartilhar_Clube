"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { adminRequest } from "@/lib/materials/admin-client";
import { userErrorMessage } from "@/lib/admin/users-client";

const fieldClass = "block text-sm font-medium text-primary mb-1";

/** Posts to /api/account/password (Better Auth verifies the current password; other sessions are revoked). */
export function ChangePasswordForm({ minimum, maximum, required }: { minimum: number; maximum: number; required: boolean }) {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword !== String(form.get("confirmation") ?? "")) { setError("A confirmação não confere com a nova senha."); return; }
    if (newPassword.length < minimum || newPassword.length > maximum) { setError(`A nova senha precisa ter de ${minimum} a ${maximum} caracteres.`); return; }
    if (newPassword === currentPassword) { setError("A nova senha precisa ser diferente da atual."); return; }
    setBusy(true); setError(null);
    const result = await adminRequest<{ destination: string }>(fetch, "/api/account/password", "POST", { currentPassword, newPassword });
    if (!result.ok) { setBusy(false); setError(userErrorMessage(result.status, result.code)); return; }
    // Full navigation so the session state is read again with the new session cookie.
    window.location.assign(result.data.destination === "/admin/dashboard" ? "/admin/dashboard" : "/aluno/dashboard");
  }

  async function leave() {
    setBusy(true);
    try { await logout(); } finally { window.location.assign("/login"); }
  }

  return (
    <form onSubmit={submit} className="space-y-6" aria-busy={busy}>
      <div><label htmlFor="current-password" className={fieldClass}>{required ? "Senha inicial (recebida do administrador)" : "Senha atual"}</label>
        <Input id="current-password" name="currentPassword" type="password" required maxLength={maximum} autoComplete="current-password" disabled={busy} /></div>
      <div><label htmlFor="new-password" className={fieldClass}>Nova senha</label>
        <Input id="new-password" name="newPassword" type="password" required minLength={minimum} maxLength={maximum} autoComplete="new-password" disabled={busy} />
        <p className="mt-1 text-xs text-muted-foreground">De {minimum} a {maximum} caracteres. Seus outros acessos abertos serão encerrados.</p></div>
      <div><label htmlFor="confirm-password" className={fieldClass}>Confirmar nova senha</label>
        <Input id="confirm-password" name="confirmation" type="password" required maxLength={maximum} autoComplete="new-password" disabled={busy} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full bg-primary hover:bg-primary/90 text-white rounded-full" size="lg">
        {busy ? "Salvando…" : "Salvar nova senha"}
      </Button>
      <Button type="button" variant="outline" disabled={busy} onClick={leave} className="w-full rounded-full">Sair</Button>
    </form>
  );
}
