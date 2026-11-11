"use client";
import { useRef, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Edit, Archive, Eye, EyeOff, ArrowUp, ArrowDown, FileText, RotateCcw } from "lucide-react";
import { centsToInput, formatPriceCents } from "@/lib/materials/price";
import {
  adminRequest, buildMaterialChange, buildMaterialInput, buildStatusChange, formatFileSize, materialErrorMessage, moveInOrder,
  shouldReload, MaterialFormError, type MaterialFormValues,
} from "@/lib/materials/admin-client";
import { toMaterialAdminView, type MaterialAdminView } from "@/lib/materials/types";

const statusNames = { DRAFT: "Rascunho", PUBLISHED: "Publicado", ARCHIVED: "Arquivado" };
const BASE = "/api/admin/materials";
const fieldClass = "block text-sm font-medium text-primary mb-1";
const selectClass = "border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50 md:text-sm";

type Props = { initialMaterials: MaterialAdminView[] | null; coverOptions: string[]; storageConfigured: boolean };
type Confirm = { kind: "archive"; material: MaterialAdminView } | { kind: "remove-pdf"; material: MaterialAdminView; assetId: string };

function pdfState(material: MaterialAdminView) {
  const validated = material.assets.find(asset => asset.status === "VALIDATED");
  if (validated) return { validated, label: `PDF disponível: ${validated.originalFilename} · ${formatFileSize(validated.fileSize)} · versão ${validated.version}` };
  if (material.assets.some(asset => asset.status === "PENDING")) return { validated: null, label: "PDF: envio pendente de validação" };
  return { validated: null, label: "PDF: nenhum arquivo associado" };
}

export function MaterialManager({ initialMaterials, coverOptions, storageConfigured }: Props) {
  const [materials, setMaterials] = useState(initialMaterials);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(initialMaterials === null ? "Não foi possível carregar os materiais." : "");
  const [editor, setEditor] = useState<MaterialAdminView | "new" | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = (materials ?? []).filter(material => material.status !== "ARCHIVED");
  const archived = (materials ?? []).filter(material => material.status === "ARCHIVED");
  const covers = Array.from(new Set([...coverOptions, ...(materials ?? []).map(material => material.coverImage)])).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const editing = editor && editor !== "new" ? editor : null;
  const [cover, setCover] = useState("");

  async function reload() {
    const result = await adminRequest<Parameters<typeof toMaterialAdminView>[0][]>(fetch, BASE);
    if (!result.ok) throw new Error(materialErrorMessage(result.status, result.code));
    setMaterials(result.data.map(toMaterialAdminView));
  }

  /** Single entry point for every write: blocks duplicate submissions until the request settles. */
  async function run(path: string, method: string, body: unknown, success: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const result = await adminRequest(fetch, path, method, body);
      if (!result.ok) {
        const text = materialErrorMessage(result.status, result.code);
        if (shouldReload(result.status)) { setEditor(null); setConfirm(null); await reload().catch(() => undefined); }
        setError(text);
        return;
      }
      setEditor(null); setConfirm(null); setMessage(success);
      try { await reload(); } catch { setError("A alteração foi salva, mas a lista não foi atualizada. Use Atualizar lista."); }
    } finally { lock.current = false; setBusy(false); }
  }

  async function retry() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await reload(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível carregar os materiais."); }
    finally { lock.current = false; setBusy(false); }
  }

  function openEditor(target: MaterialAdminView | "new") {
    setError(""); setMessage("");
    setCover(target === "new" ? "" : target.coverImage);
    setEditor(target);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: MaterialFormValues = {
      title: String(form.get("title") ?? ""), description: String(form.get("description") ?? ""), price: String(form.get("price") ?? ""),
      coverImage: String(form.get("coverImage") ?? ""), checkoutUrl: String(form.get("checkoutUrl") ?? ""),
      isPremium: form.get("isPremium") === "on", displayOrder: String(form.get("displayOrder") ?? ""),
    };
    try {
      if (!editing) { void run(BASE, "POST", buildMaterialInput(values), "Material cadastrado como rascunho."); return; }
      const change = buildMaterialChange(editing, values);
      if (!change) { setError("Nenhuma alteração para salvar."); return; }
      void run(`${BASE}/${encodeURIComponent(editing.id)}`, "PATCH", change, "Material atualizado.");
    } catch (failure) {
      setError(failure instanceof MaterialFormError ? failure.message : "Confira os campos do formulário.");
    }
  }

  const setStatus = (material: MaterialAdminView, status: MaterialAdminView["status"], success: string) =>
    run(`${BASE}/${encodeURIComponent(material.id)}`, "PATCH", buildStatusChange(material, status), success);
  function move(index: number, direction: "up" | "down") {
    const body = moveInOrder(active.map(material => material.id), index, direction);
    if (body) void run(`${BASE}/order`, "PUT", body, "Ordem atualizada.");
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div><h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">Gerenciar Recursos</h1><p className="text-muted-foreground text-lg">Cadastre, edite, publique e organize os materiais</p></div>
        <Button disabled={busy || materials === null} onClick={() => openEditor("new")} className="bg-accent hover:bg-accent-dark text-primary font-semibold rounded-full"><Plus className="w-4 h-4 mr-2" />Adicionar material</Button>
      </div>
      <div aria-live="polite" className="space-y-2">
        {message && <p role="status" className="text-sm text-primary">{message}</p>}
        {error && !editor && !confirm && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" disabled={busy} onClick={retry}>Atualizar lista</Button></div>}
      </div>
      {!storageConfigured && materials !== null && (
        <Card className="p-6 gap-2 border-accent/30 bg-accent/5" role="note">
          <h2 className="font-semibold text-primary">Envio de PDF indisponível</h2>
          <p className="text-sm text-muted-foreground">O armazenamento privado de arquivos ainda não está configurado. Os materiais podem ser gerenciados normalmente; a associação de PDFs será habilitada após a configuração.</p>
        </Card>
      )}
      {materials?.length === 0 && <Card className="p-6 text-muted-foreground">Nenhum material cadastrado. Adicione o primeiro material; ele será salvo como rascunho.</Card>}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6" aria-busy={busy}>
        {active.map((material, index) => {
          const pdf = pdfState(material);
          return (
            <Card key={material.id} className="p-6 gap-4 min-w-0">
              <img src={material.coverImage} alt={material.title} loading="lazy" className="w-full h-48 object-contain rounded-lg" />
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-lg font-semibold text-primary font-display break-words min-w-0">{material.title}</h2>
                <span className="inline-flex items-center gap-1 bg-muted px-3 py-1 rounded-full text-xs font-medium text-primary">{material.status === "PUBLISHED" ? <Eye className="w-3 h-3" aria-hidden /> : <EyeOff className="w-3 h-3" aria-hidden />}{statusNames[material.status]}</span>
              </div>
              <p className="font-semibold text-primary">{formatPriceCents(material.priceCents)}</p>
              <p className="text-xs text-muted-foreground">Posição: {index + 1}</p>
              <p className="text-sm text-muted-foreground inline-flex items-center gap-2"><FileText className="w-4 h-4 flex-shrink-0" aria-hidden />{pdf.label}</p>
              {material.isPremium && <p className="text-xs text-accent">Selo visual: Premium</p>}
              {!material.checkoutUrl && <p className="text-sm text-muted-foreground">Link comercial não informado</p>}
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} variant="outline" size="sm" className="rounded-full bg-transparent" onClick={() => openEditor(material)}><Edit className="w-4 h-4 mr-2" />Editar</Button>
                <Button disabled={busy} variant="outline" size="sm" className="rounded-full bg-transparent" onClick={() => setStatus(material, material.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED", material.status === "PUBLISHED" ? "Material despublicado." : "Material publicado.")}>{material.status === "PUBLISHED" ? "Despublicar" : "Publicar"}</Button>
                <Button disabled={busy || index === 0} variant="outline" size="sm" aria-label={`Mover ${material.title} para cima`} onClick={() => move(index, "up")}><ArrowUp className="w-4 h-4" /></Button>
                <Button disabled={busy || index === active.length - 1} variant="outline" size="sm" aria-label={`Mover ${material.title} para baixo`} onClick={() => move(index, "down")}><ArrowDown className="w-4 h-4" /></Button>
                <Button disabled={busy} variant="outline" size="sm" className="rounded-full text-destructive border-destructive/30 bg-transparent" onClick={() => { setError(""); setConfirm({ kind: "archive", material }); }}><Archive className="w-4 h-4 mr-2" />Arquivar</Button>
              </div>
            </Card>
          );
        })}
      </div>
      {archived.length > 0 && (
        <section className="space-y-4" aria-labelledby="archived-materials">
          <Button variant="outline" disabled={busy} aria-expanded={showArchived} aria-controls={showArchived ? "archived-list" : undefined} onClick={() => setShowArchived(open => !open)} className="rounded-full bg-transparent">
            <span id="archived-materials">{showArchived ? "Ocultar" : "Mostrar"} arquivados ({archived.length})</span>
          </Button>
          {showArchived && (
            <div id="archived-list" className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
              {archived.map(material => (
                <Card key={material.id} className="p-6 gap-3 min-w-0 opacity-80">
                  <img src={material.coverImage} alt={material.title} loading="lazy" className="w-full h-32 object-contain rounded-lg" />
                  <h2 className="font-semibold text-primary font-display break-words">{material.title}</h2>
                  <p className="text-xs text-muted-foreground">Arquivado · não aparece para alunos nem na vitrine</p>
                  <Button disabled={busy} variant="outline" size="sm" className="rounded-full bg-transparent self-start" onClick={() => setStatus(material, "DRAFT", "Material restaurado como rascunho.")}><RotateCcw className="w-4 h-4 mr-2" />Restaurar como rascunho</Button>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      <Dialog open={editor !== null} onOpenChange={open => { if (!open && !busy) setEditor(null); }}>
        <DialogContent showCloseButton={!busy} className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar material" : "Adicionar material"}</DialogTitle><DialogDescription>{editing ? "Somente os campos alterados serão salvos." : "Novos materiais começam como rascunho e não aparecem para alunos até serem publicados."}</DialogDescription></DialogHeader>
          <form key={editing?.id ?? "new"} onSubmit={submit} className="space-y-4" aria-busy={busy}>
            <div><label htmlFor="material-title" className={fieldClass}>Título</label><Input id="material-title" name="title" required maxLength={300} defaultValue={editing?.title ?? ""} disabled={busy} /></div>
            <div><label htmlFor="material-description" className={fieldClass}>Descrição (opcional)</label><Textarea id="material-description" name="description" maxLength={10000} rows={4} defaultValue={editing?.description ?? ""} disabled={busy} /></div>
            <div><label htmlFor="material-price" className={fieldClass}>Preço (R$)</label><Input id="material-price" name="price" required inputMode="decimal" placeholder="4,90" pattern="^(R\$\s*)?\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$" title="Use o formato 4,90" defaultValue={editing ? centsToInput(editing.priceCents) : ""} disabled={busy} /></div>
            <div>
              <label htmlFor="material-cover" className={fieldClass}>Capa</label>
              <select id="material-cover" name="coverImage" required value={cover} onChange={event => setCover(event.target.value)} disabled={busy} className={selectClass}>
                <option value="" disabled>Escolha uma imagem existente</option>
                {covers.map(path => <option key={path} value={path}>{path.replace(/^\//, "")}</option>)}
              </select>
              {cover && <img src={cover} alt="Pré-visualização da capa selecionada" className="mt-2 w-full h-32 object-contain rounded-lg bg-muted" />}
            </div>
            <div><label htmlFor="material-checkout" className={fieldClass}>Link de compra Hotmart (opcional)</label><Input id="material-checkout" name="checkoutUrl" type="url" maxLength={2048} placeholder="https://go.hotmart.com/…" defaultValue={editing?.checkoutUrl ?? ""} disabled={busy} /></div>
            {!editing && <div><label htmlFor="material-order" className={fieldClass}>Posição na lista</label><Input id="material-order" name="displayOrder" type="number" required min={1} step={1} defaultValue={active.length + 1} disabled={busy} /></div>}
            <div className="flex items-center gap-2"><input id="material-premium" name="isPremium" type="checkbox" defaultChecked={editing?.isPremium ?? false} disabled={busy} className="h-4 w-4 accent-primary" /><label htmlFor="material-premium" className="text-sm text-primary">Exibir selo Premium</label></div>
            {editing && (
              <fieldset className="space-y-2 rounded-lg border p-4">
                <legend className="px-1 text-sm font-medium text-primary">PDF do material</legend>
                <p className="text-sm text-muted-foreground">{pdfState(editing).label}</p>
                {!storageConfigured && <p className="text-sm text-muted-foreground">Envio de PDF indisponível: o armazenamento privado ainda não está configurado.</p>}
                {pdfState(editing).validated && <Button type="button" variant="outline" size="sm" disabled={busy} className="rounded-full text-destructive border-destructive/30 bg-transparent" onClick={() => { const asset = pdfState(editing).validated; if (asset) { setEditor(null); setConfirm({ kind: "remove-pdf", material: editing, assetId: asset.id }); } }}>Remover PDF</Button>}
              </fieldset>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy} className="bg-accent text-primary rounded-full">{busy ? "Salvando…" : "Salvar material"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setEditor(null)}>Cancelar</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm !== null} onOpenChange={open => { if (!open && !busy) setConfirm(null); }}>
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{confirm?.kind === "remove-pdf" ? "Remover PDF?" : "Arquivar material?"}</DialogTitle>
            <DialogDescription>{confirm?.kind === "remove-pdf"
              ? `O PDF deixará de estar associado a “${confirm.material.title}”. O arquivo não é apagado do armazenamento.`
              : `“${confirm?.material.title ?? ""}” deixará de aparecer para alunos e na vitrine. Nada é excluído; você poderá restaurá-lo depois.`}</DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} variant="destructive" onClick={() => {
              if (!confirm) return;
              if (confirm.kind === "archive") void setStatus(confirm.material, "ARCHIVED", "Material arquivado.");
              else void run(`${BASE}/${encodeURIComponent(confirm.material.id)}/pdf`, "DELETE", { assetId: confirm.assetId }, "PDF removido do material.");
            }}>{busy ? "Processando…" : confirm?.kind === "remove-pdf" ? "Confirmar remoção" : "Confirmar arquivamento"}</Button>
            <Button disabled={busy} variant="outline" onClick={() => setConfirm(null)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
