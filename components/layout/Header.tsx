"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur border-b border-border/60 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20 md:h-24">
          {/* LOGO */}
          <Link href="/" className="flex items-center gap-4">
            <div className="flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full bg-white shadow-md border border-border/40 overflow-hidden">
              <img
                src="/logoo.webp"
                alt="Compartilhar Clube"
                className="w-full h-full object-cover"
              />
            </div>

            <span className="hidden md:block text-xl md:text-2xl font-semibold text-primary tracking-tight font-display">
              Compartilhar Clube
            </span>
          </Link>

          {/* DESKTOP NAV */}
          <nav className="hidden md:flex items-center gap-10">
            <Link
              href="/"
              className="text-base font-medium text-foreground hover:text-primary transition-colors"
            >
              Início
            </Link>

            <Link
              href="/materiais"
              className="text-base font-medium text-foreground hover:text-primary transition-colors"
            >
              Recursos Individuais
            </Link>

            <Link
              href="/clube"
              className="text-base font-medium text-foreground hover:text-primary transition-colors"
            >
              Clube de Assinatura
            </Link>

            <Link
              href="/contato"
              className="text-base font-medium text-foreground hover:text-primary transition-colors"
            >
              Fale Conosco
            </Link>
          </nav>

          {/* CTA DESKTOP */}
          <div className="hidden md:block">
            <Button
              asChild
              className="bg-gradient-to-r from-accent to-[#f3c969] text-primary font-semibold text-base rounded-full px-8 py-3 shadow-md hover:shadow-lg hover:scale-[1.05] transition-all"
            >
              <Link href="/login">Acessar Plataforma</Link>
            </Button>
          </div>

          {/* MOBILE MENU BUTTON */}
          <button
            onClick={() => setIsMenuOpen(true)}
            className="md:hidden p-2 rounded-lg text-primary hover:bg-muted transition"
            aria-label="Abrir menu"
          >
            <Menu size={26} />
          </button>
        </div>
      </div>

      {/* ================= MOBILE MENU PREMIUM ================= */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[9999] md:hidden">
          {/* BACKDROP */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsMenuOpen(false)}
          />

          {/* MENU CONTAINER */}
          <div className="absolute top-0 left-0 right-0 bg-white rounded-b-3xl shadow-2xl px-6 pt-6 pb-10">
            {/* HEADER */}
            <div className="flex items-center justify-between mb-8">
              <span className="text-lg font-bold text-primary font-display">
                Menu
              </span>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-2 rounded-full bg-muted text-primary"
              >
                <X size={22} />
              </button>
            </div>

            {/* LINKS */}
            <nav className="flex flex-col gap-6 text-lg font-medium text-foreground">
              <Link href="/" onClick={() => setIsMenuOpen(false)}>
                Início
              </Link>

              <Link href="/materiais" onClick={() => setIsMenuOpen(false)}>
                Recursos Individuais
              </Link>

              <Link
                href="/clube"
                onClick={() => setIsMenuOpen(false)}
                className="text-accent font-semibold"
              >
                Clube de Assinatura
              </Link>

              <Link href="/contato" onClick={() => setIsMenuOpen(false)}>
                Fale Conosco
              </Link>
            </nav>

            {/* CTA MOBILE */}
            <div className="mt-10">
              <Button
                asChild
                className="w-full bg-gradient-to-r from-accent to-[#f3c969] text-primary font-bold text-lg py-5 rounded-full shadow-xl"
              >
                <Link href="/login">Acessar Plataforma</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
