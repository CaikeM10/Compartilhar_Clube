"use client";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/button";

export default function MateriaisError({ reset }: { reset: () => void }) {
  return (
    <Container>
      <div className="py-20 text-center space-y-6" role="alert">
        <h1 className="text-3xl md:text-4xl font-bold text-primary font-display">Catálogo temporariamente indisponível</h1>
        <p className="text-muted-foreground">Não foi possível carregar os materiais agora. Tente novamente em instantes.</p>
        <Button onClick={reset} className="rounded-full">Tentar novamente</Button>
      </div>
    </Container>
  );
}
