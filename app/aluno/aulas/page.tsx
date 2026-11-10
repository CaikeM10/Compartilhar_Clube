import { MemberLayout } from "@/components/layout/MemberLayout";
import { requirePageAccess } from "@/lib/auth/page-access";
import { getLessons } from "@/lib/lessons/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Video, Clock, Play } from "lucide-react";
import Link from "next/link";

export default async function AulasPage() {
  const { user } = await requirePageAccess("subscriber");
  const lessons = await getLessons().listPublished();
  return (
    <MemberLayout viewer={user}>
      <div className="space-y-8">
        <div><h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">Aulas do Compartilhar Clube</h1><p className="text-muted-foreground text-lg">Conteúdo de formação continuada para sua prática profissional</p></div>
        {lessons.length === 0 && <Card className="p-6 text-muted-foreground">Ainda não há aulas publicadas. As novas aulas aparecerão aqui quando forem disponibilizadas.</Card>}
        <div className="grid gap-6">
          {lessons.map(lesson => (
            <Card key={lesson.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="relative w-full md:w-64 h-40 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                  <Play className="w-16 h-16 text-white/80" />
                  <div className="absolute bottom-3 right-3 bg-black/70 px-2 py-1 rounded text-white text-xs flex items-center gap-1"><Clock className="w-3 h-3" />{lesson.durationMinutes} min</div>
                </div>
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex-1"><div className="flex items-start gap-3 mb-2"><Video className="w-5 h-5 text-primary flex-shrink-0 mt-1" /><div className="flex-1 min-w-0"><h3 className="text-xl font-semibold text-primary mb-1 font-display break-words">{lesson.title}</h3><p className="text-muted-foreground whitespace-pre-wrap break-words">{lesson.description}</p></div></div></div>
                  <div className="mt-4"><Button asChild className="bg-accent hover:bg-accent-dark text-primary font-semibold rounded-full"><Link href={`/aluno/aulas/${lesson.id}`}>Assistir aula</Link></Button></div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </MemberLayout>
  );
}
