"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";

interface MaterialLibraryCardProps {
  title: string;
  image: string;
  fileUrl: string;
}

export function MaterialLibraryCard({
  title,
  image,
  fileUrl,
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
        <h3 className="text-lg font-semibold text-primary leading-snug mb-6">
          {title}
        </h3>

        {/* CTA */}
        <Button
          asChild
          className="mt-auto w-full bg-gradient-to-r from-accent to-[#f3c969] hover:brightness-110 text-primary font-bold rounded-full shadow-lg transition-all"
        >
          <a
            href={fileUrl}
            download
            className="flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Baixar PDF
          </a>
        </Button>
      </div>
    </Card>
  );
}
