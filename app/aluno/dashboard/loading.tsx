import { Card } from "@/components/ui/card";

export default function LoadingDashboard() {
  return (
    <div className="lg:ml-72 p-6 lg:p-8 space-y-8" role="status" aria-live="polite" aria-busy="true">
      <p className="text-muted-foreground">Carregando seu dashboard…</p>
      <Card className="p-6 h-36 bg-primary/5" aria-hidden="true" />
      <div className="grid md:grid-cols-3 gap-6" aria-hidden="true">
        {[0, 1, 2].map(item => <Card key={item} className="p-6 h-40 bg-muted/30" />)}
      </div>
    </div>
  );
}
