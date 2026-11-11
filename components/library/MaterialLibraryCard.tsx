"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";

interface MaterialLibraryCardProps {
  id?: string;
  title: string;
  image: string;
  description?: string | null;
  /** True only when the material has a validated private PDF. */
  hasPdf?: boolean;
}

export function MaterialLibraryCard({
  id,
  title,
  image,
  description,
  hasPdf = false,
}: MaterialLibraryCardProps) {
  return (
    <Card className="group relative flex flex-col overflow-hidden border border-border/60 bg-background shadow-md hover:shadow-xl transition-all duration-300">
      {/* IMAGEM / CAPA */}
      <div className="relative h-[320px] overflow-hidden">
        <img
          src={image}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Overlay premium */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />

        {/* Ícone sutil */}
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm">
          <FileText className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-primary">PDF</span>
        </div>
      </div>

      {/* CONTEÚDO */}
      <div className="flex flex-col flex-1 p-6 text-center">
        <h3 className={`text-lg font-semibold text-primary leading-snug ${description ? "mb-2" : "mb-6"}`}>
          {title}
        </h3>
        {description && <p className="text-sm text-muted-foreground mb-6 whitespace-pre-wrap break-words">{description}</p>}

        {/* CTA */}
        {hasPdf && id ? (
          // Only the protected endpoint: it re-checks session, subscription and publication, then redirects to a short-lived signed URL.
          <Button
            asChild
            className="mt-auto w-full bg-gradient-to-r from-accent to-[#f3c969] hover:brightness-110 text-primary font-bold rounded-full shadow-lg transition-all"
          >
            <a href={`/api/materials/${encodeURIComponent(id)}/download`} rel="nofollow" className="inline-flex items-center justify-center gap-2">
              <Download className="w-5 h-5" />
              Baixar PDF
            </a>
          </Button>
        ) : (
          <Button
            disabled
            className="mt-auto w-full bg-gradient-to-r from-accent to-[#f3c969] hover:brightness-110 text-primary font-bold rounded-full shadow-lg transition-all"
          >
            PDF ainda indisponível
          </Button>
        )}
      </div>
    </Card>
  );
}
