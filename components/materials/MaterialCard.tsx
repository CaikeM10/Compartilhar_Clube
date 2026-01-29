"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Crown, ShoppingCart } from "lucide-react";

interface MaterialCardProps {
  title: string;
  price: string;
  checkoutUrl: string; // 🔗 link do Hotmart
  image: string;
  isPremium?: boolean;
}

export function MaterialCard({
  title,
  price,
  checkoutUrl,
  image,
  isPremium = false,
}: MaterialCardProps) {
  return (
    <Card className="group relative flex flex-col overflow-hidden border border-border/60 bg-background shadow-md hover:shadow-2xl transition-all duration-300 rounded-2xl">
      {/* IMAGEM */}
      <div className="relative h-56 overflow-hidden">
        <img
          src={image}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
        />

        {/* Overlay premium */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent" />

        {/* Badge Premium */}
        {isPremium && (
          <div className="absolute top-4 right-4 flex items-center gap-1 bg-gradient-to-r from-accent to-[#f3c969] text-primary text-xs font-semibold px-3 py-1 rounded-full shadow-lg">
            <Crown className="w-3.5 h-3.5" />
            Premium
          </div>
        )}
      </div>

      {/* CONTEÚDO */}
      <div className="flex flex-col flex-1 p-6 text-center">
        <h3 className="text-lg font-semibold text-primary mb-4 leading-snug">
          {title}
        </h3>

        {/* PREÇO */}
        <span className="text-2xl font-bold text-primary mb-6">{price}</span>

        {/* CTA */}
        <Button
          asChild
          className="mt-auto bg-gradient-to-r from-accent to-[#f3c969] hover:brightness-110 text-primary font-bold rounded-full py-3 shadow-lg transition-all"
        >
          <a
            href={checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2"
          >
            <ShoppingCart className="w-5 h-5" />
            Comprar material
          </a>
        </Button>
      </div>
    </Card>
  );
}
