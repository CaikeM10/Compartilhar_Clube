"use client";
import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Video, Plus, Edit, Archive, Eye, EyeOff, ArrowUp, ArrowDown } from "lucide-react";
import type { LessonView } from "@/lib/lessons/validation";

const statusNames = { DRAFT: "Rascunho", PUBLISHED: "Publicada", ARCHIVED: "Arquivada" };
const messages: Record<string, string> = {
  INVALID_LESSON: "Confira os campos. Use um link HTTPS de vídeo do YouTube ou Vimeo e duração entre 1 e 1440 minutos.",
  FORBIDDEN: "Você não tem permissão para gerenciar aulas.", UNAUTHENTICATED: "Sua sessão terminou. Entre novamente.",
  LESSON_NOT_FOUND: "Esta aula não foi encontrada. Atualize a lista.", INVALID_ORIGIN: "Não foi possível validar a origem. Reabra a plataforma pelo endereço configurado.",
};

export function LessonManager({ initialLessons }: { initialLessons: LessonView[] | null }) {
  const [lessons, setLessons] = useState(initialLessons);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(initialLessons === null ? "Não foi possível carregar as aulas." : "");
  const [editor, setEditor] = useState<LessonView | "new" | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<LessonView | null>(null);
  async function reload() {
    const response = await fetch("/api/admin/lessons", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("RELOAD_FAILED");
    setLessons(await response.json());
  }
  async function retry() {
    setBusy(true); setError("");
    try { await reload(); } catch { setError("Não foi possível carregar as aulas. Confira sua sessão e tente novamente."); }
    finally { setBusy(false); }
  }
  async function mutate(id: string | null, payload: unknown) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(id ? `/api/admin/lessons/${encodeURIComponent(id)}` : "/api/admin/lessons", {
        method: id ? "PATCH" : "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(messages[body.error] ?? "SAVE_FAILED");
      }
      setEditor(null); setArchiveTarget(null); setMessage("Alteração salva.");
      try { await reload(); } catch { setError("A alteração foi salva, mas a lista não foi atualizada. Use Atualizar lista."); }
    } catch (failure) {
      setError(failure instanceof Error && Object.values(messages).includes(failure.message) ? failure.message : "Não foi possível confirmar a alteração. Atualize a lista antes de tentar novamente.");
    } finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = { title: form.get("title"), description: form.get("description"), videoUrl: form.get("videoUrl"), durationMinutes: Number(form.get("durationMinutes")) };
    void mutate(editor && editor !== "new" ? editor.id : null, editor === "new" ? data : { action: "edit", data });
  }
  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div><h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">Gerenciar Aulas</h1><p className="text-muted-foreground text-lg">Cadastre e organize as aulas da plataforma</p></div>
        <Button disabled={busy} onClick={() => { setEditor("new"); setError(""); }} className="bg-accent hover:bg-accent-dark text-primary font-semibold rounded-full"><Plus className="w-4 h-4 mr-2" />Adicionar Aula</Button>
      </div>
      {message && <p role="status" className="text-sm text-primary">{message}</p>}
      {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" disabled={busy} onClick={retry}>Atualizar lista</Button></div>}
      {lessons?.length === 0 && <Card className="p-6 text-muted-foreground">Nenhuma aula cadastrada. Adicione a primeira aula; ela será salva como rascunho.</Card>}
      <div className="grid gap-4" aria-busy={busy}>
        {lessons?.map((lesson, index) => (
          <Card key={lesson.id} className="p-6">
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="w-full lg:w-48 h-32 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center flex-shrink-0"><Video className="w-12 h-12 text-white/80" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div className="min-w-0"><h3 className="text-lg font-semibold text-primary mb-1 font-display break-words">{lesson.title}</h3><p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{lesson.description}</p></div>
                  <span className="inline-flex items-center gap-1 bg-muted px-3 py-1 rounded-full text-xs font-medium text-primary">{lesson.status === "PUBLISHED" ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}{statusNames[lesson.status]}</span>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4"><span>Duração: {lesson.durationMinutes} min</span><span>Ordem: {index + 1}</span></div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy} variant="outline" size="sm" className="rounded-full bg-transparent" onClick={() => { setEditor(lesson); setError(""); }}><Edit className="w-4 h-4 mr-2" />Editar</Button>
                  <Button disabled={busy} variant="outline" size="sm" className="rounded-full bg-transparent" onClick={() => mutate(lesson.id, { action: "status", status: lesson.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" })}>{lesson.status === "PUBLISHED" ? "Despublicar" : "Publicar"}</Button>
                  <Button disabled={busy || index === 0} variant="outline" size="sm" aria-label={`Mover ${lesson.title} para cima`} onClick={() => mutate(lesson.id, { action: "move", direction: "up" })}><ArrowUp className="w-4 h-4" /></Button>
                  <Button disabled={busy || index === lessons.length - 1} variant="outline" size="sm" aria-label={`Mover ${lesson.title} para baixo`} onClick={() => mutate(lesson.id, { action: "move", direction: "down" })}><ArrowDown className="w-4 h-4" /></Button>
                  {lesson.status !== "ARCHIVED" && <Button disabled={busy} variant="outline" size="sm" className="rounded-full text-destructive border-destructive/30 bg-transparent" onClick={() => { setArchiveTarget(lesson); setError(""); }}><Archive className="w-4 h-4 mr-2" />Arquivar</Button>}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Dialog open={editor !== null} onOpenChange={open => { if (!open && !busy) setEditor(null); }}>
        <DialogContent showCloseButton={!busy} className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editor === "new" ? "Adicionar aula" : "Editar aula"}</DialogTitle><DialogDescription>Informe um vídeo seu já hospedado no YouTube ou Vimeo. Novas aulas começam como rascunho.</DialogDescription></DialogHeader>
          <form key={typeof editor === "object" ? editor?.id : "new"} onSubmit={submit} className="space-y-4">
            <div><label htmlFor="lesson-title">Título</label><Input id="lesson-title" name="title" required maxLength={160} defaultValue={editor && editor !== "new" ? editor.title : ""} disabled={busy} /></div>
            <div><label htmlFor="lesson-description">Descrição</label><Textarea id="lesson-description" name="description" required maxLength={10000} rows={4} defaultValue={editor && editor !== "new" ? editor.description : ""} disabled={busy} /></div>
            <div><label htmlFor="lesson-video">Link do vídeo</label><Input id="lesson-video" name="videoUrl" type="url" required maxLength={2048} defaultValue={editor && editor !== "new" ? editor.videoUrl : ""} disabled={busy} /></div>
            <div><label htmlFor="lesson-duration">Duração em minutos</label><Input id="lesson-duration" name="durationMinutes" type="number" required min={1} max={1440} step={1} defaultValue={editor && editor !== "new" ? editor.durationMinutes : ""} disabled={busy} /></div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy} className="bg-accent text-primary rounded-full">{busy ? "Salvando…" : "Salvar aula"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setEditor(null)}>Cancelar</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={archiveTarget !== null} onOpenChange={open => { if (!open && !busy) setArchiveTarget(null); }}>
        <DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>Arquivar aula?</DialogTitle><DialogDescription>“{archiveTarget?.title}” deixará de aparecer para os alunos. Você poderá publicá-la novamente.</DialogDescription></DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2"><Button disabled={busy} variant="destructive" onClick={() => archiveTarget && mutate(archiveTarget.id, { action: "status", status: "ARCHIVED" })}>{busy ? "Arquivando…" : "Confirmar arquivamento"}</Button><Button disabled={busy} variant="outline" onClick={() => setArchiveTarget(null)}>Cancelar</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
