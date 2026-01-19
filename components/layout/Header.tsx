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
                src="/logo.png"
                alt="Compartilhar Clube"
                className="w-full h-full object-cover scale-100"
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
              href="/recursos"
              className="text-base font-medium text-foreground hover:text-primary transition-colors"
            >
              Recursos
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
              className="bg-accent text-primary font-semibold text-base rounded-full px-8 py-3 shadow-md hover:shadow-lg hover:scale-[1.05] transition-all"
            >
              <Link href="/login">Acessar Plataforma</Link>
            </Button>
          </div>

          {/* MOBILE MENU BUTTON */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 rounded-lg text-primary hover:bg-muted transition"
            aria-label="Abrir menu"
          >
            {isMenuOpen ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>

        {/* MOBILE MENU */}
        {isMenuOpen && (
          <nav className="md:hidden py-6 border-t border-border/60">
            <div className="flex flex-col gap-5">
              <Link
                href="/"
                onClick={() => setIsMenuOpen(false)}
                className="text-lg font-medium text-foreground hover:text-primary transition-colors"
              >
                Início
              </Link>
              <Link
                href="/recursos"
                onClick={() => setIsMenuOpen(false)}
                className="text-lg font-medium text-foreground hover:text-primary transition-colors"
              >
                Recursos
              </Link>
              <Link
                href="/clube"
                onClick={() => setIsMenuOpen(false)}
                className="text-lg font-medium text-foreground hover:text-primary transition-colors"
              >
                Clube de Assinatura
              </Link>
              <Link
                href="/contato"
                onClick={() => setIsMenuOpen(false)}
                className="text-lg font-medium text-foreground hover:text-primary transition-colors"
              >
                Fale Conosco
              </Link>

              <Button
                asChild
                className="bg-accent text-primary font-semibold text-base rounded-full mt-4 py-3 shadow-md hover:shadow-lg transition"
              >
                <Link href="/login">Acessar Plataforma</Link>
              </Button>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
