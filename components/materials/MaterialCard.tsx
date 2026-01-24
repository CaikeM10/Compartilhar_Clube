"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Crown, ExternalLink } from "lucide-react";

interface MaterialCardProps {
  title: string;
  description: string;
  pages: number;
  audience: string;
  price: string;
  canvaUrl: string;
  isPremium?: boolean;
}

export function MaterialCard({
  title,
  description,
  pages,
  audience,
  price,
  canvaUrl,
  isPremium = false,
}: MaterialCardProps) {
  return (
    <Card className="relative flex flex-col p-6 border border-border/60 bg-background hover:shadow-xl transition-all duration-300">
      {/* Badge Premium */}
      {isPremium && (
        <div className="absolute top-4 right-4 flex items-center gap-1 bg-accent text-primary text-xs font-semibold px-3 py-1 rounded-full">
          <Crown className="w-3.5 h-3.5" />
          Premium
        </div>
      )}

      {/* Ícone */}
      <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center mb-4">
        <FileText className="w-6 h-6 text-accent" />
      </div>

      {/* Conteúdo */}
      <h3 className="text-lg font-semibold text-primary mb-2">{title}</h3>

      <p className="text-sm text-muted-foreground mb-4">{description}</p>

      <ul className="text-sm text-muted-foreground mb-6 space-y-1">
        <li>• {pages} páginas</li>
        <li>• Público: {audience}</li>
      </ul>

      {/* Rodapé */}
      <div className="mt-auto flex items-center justify-between">
        <span className="text-lg font-bold text-primary">{price}</span>

        <Button
          asChild
          className="bg-accent hover:bg-accent-dark text-primary rounded-full"
        >
          <a href={canvaUrl} target="_blank" rel="noopener noreferrer">
            Acessar no Canva
            <ExternalLink className="w-4 h-4 ml-2" />
          </a>
        </Button>
      </div>
    </Card>
  );
}
