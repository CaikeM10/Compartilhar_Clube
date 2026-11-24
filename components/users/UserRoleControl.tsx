"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminRequest } from "@/lib/materials/admin-client";
import { userErrorMessage } from "@/lib/admin/users-client";

type Target = { id: string; name: string | null; email: string; role: "admin" | "student"; updatedAt: string };

/**
 * Rendered only for principal administrators and only on non-principal accounts other than their own.
 * The server enforces the same rules (and the database refuses changes to principal accounts).
 */
export function UserRoleControl({ user }: { user: Target }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promote = user.role === "student";
  const label = user.name ?? user.email;

  async function apply() {
    setBusy(true); setError(null);
    const result = await adminRequest(fetch, `/api/admin/users/${encodeURIComponent(user.id)}/role`, "PATCH", {
      role: promote ? "admin" : "student", expectedUpdatedAt: user.updatedAt,
    });
    setBusy(false);
    if (!result.ok) { setError(userErrorMessage(result.status, result.code)); return; }
    setConfirming(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => { setError(null); setConfirming(true); }}>
        {promote ? "Tornar administrador" : "Remover acesso admin"}
      </Button>
      <Dialog open={confirming} onOpenChange={open => { if (!open && !busy) setConfirming(false); }}>
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{promote ? "Tornar administrador?" : "Remover acesso de administrador?"}</DialogTitle>
            <DialogDescription>
              {promote
                ? `“${label}” passará a acessar o painel administrativo como administrador comum (sem poder criar administradores).`
                : `“${label}” voltará a ser aluno e perderá o acesso ao painel administrativo imediatamente.`}
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={apply} className="bg-accent text-primary rounded-full">{busy ? "Salvando…" : "Confirmar"}</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
