import Link from "next/link";
import { notFound } from "next/navigation";
import { MemberLayout } from "@/components/layout/MemberLayout";
import { Card } from "@/components/ui/card";
import { requirePageAccess } from "@/lib/auth/page-access";
import { getLessons } from "@/lib/lessons/server";
import { LessonError } from "@/lib/lessons/service-core";
import { normalizeVideoUrl } from "@/lib/lessons/validation";

export default async function WatchLesson({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePageAccess("subscriber");
  let lesson;
  try { lesson = await getLessons().watch((await params).id); }
  catch (error) { if (error instanceof LessonError && error.status === 404) notFound(); throw error; }
  const video = normalizeVideoUrl(lesson.videoUrl);
  return (
    <MemberLayout viewer={user}>
      <div className="space-y-8">
        <Link href="/aluno/aulas" className="text-primary underline underline-offset-4">Voltar às aulas</Link>
        <div><h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display break-words">{lesson.title}</h1><p className="text-sm text-muted-foreground">{lesson.durationMinutes} min</p></div>
        <Card className="overflow-hidden"><iframe src={video} title={`Vídeo: ${lesson.title}`} className="w-full aspect-video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></Card>
        <p className="text-muted-foreground whitespace-pre-wrap break-words">{lesson.description}</p>
        <p className="text-sm text-muted-foreground">Se o player não carregar, tente recarregar a página. A reprodução também depende da disponibilidade e das permissões do vídeo no provedor.</p>
      </div>
    </MemberLayout>
  );
}
