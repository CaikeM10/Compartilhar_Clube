"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export function LessonsError({ reset }: { reset: () => void }) {
  return <div className="lg:ml-72 p-6 lg:p-8"><Card className="p-6 space-y-4" role="alert"><h1 className="text-2xl font-bold text-primary">Não foi possível carregar as aulas</h1><p className="text-muted-foreground">Tente novamente. Se sua sessão terminou, entre novamente na plataforma.</p><Button onClick={reset}>Tentar novamente</Button></Card></div>;
}
