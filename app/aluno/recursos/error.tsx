"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function LibraryError({ reset }: { reset: () => void }) {
  return (
    <div className="lg:ml-72 p-6 lg:p-8">
      <Card className="p-6 space-y-4" role="alert">
        <h1 className="text-2xl font-bold text-primary">Biblioteca temporariamente indisponível</h1>
        <p className="text-muted-foreground">Não foi possível carregar os materiais. Tente novamente. Se sua sessão terminou, entre novamente na plataforma.</p>
        <Button onClick={reset}>Tentar novamente</Button>
      </Card>
    </div>
  );
}
