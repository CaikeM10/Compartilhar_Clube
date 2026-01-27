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
  image: string;
  isPremium?: boolean;
}

export function MaterialCard({
  title,
  description,
  pages,
  audience,
  price,
  canvaUrl,
  image,
  isPremium = false,
}: MaterialCardProps) {
  return (
    <Card className="group relative flex flex-col overflow-hidden border border-border/60 bg-background shadow-md hover:shadow-xl transition-all duration-300">
      {/* IMAGEM */}
      <div className="relative h-48 overflow-hidden">
        <img
          src={image}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        {/* Overlay leve */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />

        {/* Badge Premium */}
        {isPremium && (
          <div className="absolute top-4 right-4 flex items-center gap-1 bg-accent text-primary text-xs font-semibold px-3 py-1 rounded-full shadow">
            <Crown className="w-3.5 h-3.5" />
            Premium
          </div>
        )}
      </div>

      {/* CONTEÚDO */}
      <div className="flex flex-col flex-1 p-6">
        <h3 className="text-lg font-bold text-primary mb-2 leading-snug">
          {title}
        </h3>

        <p className="text-sm text-muted-foreground mb-4">{description}</p>

        <ul className="text-sm text-muted-foreground mb-6 space-y-1">
          <li>• {pages} páginas</li>
          <li>• Público: {audience}</li>
        </ul>

        {/* RODAPÉ */}
        <div className="mt-auto flex items-center justify-between gap-4">
          <span className="text-xl font-bold text-primary">{price}</span>

          <Button
            asChild
            className="bg-gradient-to-r from-accent to-[#f3c969] hover:brightness-110 text-primary font-semibold rounded-full px-5"
          >
            <a
              href={canvaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2"
            >
              Acessar no PDF
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </div>
    </Card>
  );
}
