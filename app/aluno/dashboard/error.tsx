"use client";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <div className="lg:ml-72 p-6 lg:p-8">
      <Card className="p-6 space-y-4" role="alert">
        <h1 className="text-2xl font-bold text-primary font-display">Não foi possível carregar seu dashboard</h1>
        <p className="text-muted-foreground">Tente novamente. Se sua sessão tiver terminado, entre na sua conta.</p>
        <div className="flex flex-wrap gap-4 items-center">
          <Button onClick={reset} className="rounded-full bg-primary text-white">Tentar novamente</Button>
          <Link href="/login" className="text-primary underline underline-offset-4">Ir para o login</Link>
        </div>
      </Card>
    </div>
  );
}
