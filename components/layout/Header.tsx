"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-border shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary">
              <img src="/logoo.png" alt="Logo" className="w-8 h-8" />
            </div>
            <div className="hidden md:block">
              <span className="text-xl font-bold text-primary font-display">
                Compartilhar Clube
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="/"
              className="text-foreground hover:text-primary transition-colors font-medium"
            >
              Início
            </Link>
            <Link
              href="/recursos"
              className="text-foreground hover:text-primary transition-colors font-medium"
            >
              Recursos
            </Link>
            <Link
              href="/clube"
              className="text-foreground hover:text-primary transition-colors font-medium"
            >
              Clube de Assinatura
            </Link>
            <Link
              href="/contato"
              className="text-foreground hover:text-primary transition-colors font-medium"
            >
              Fale Conosco
            </Link>
          </nav>

          {/* CTA Button */}
          <div className="hidden md:block">
            <Button
              asChild
              className="bg-accent hover:bg-accent-dark text-primary font-semibold rounded-full px-6"
            >
              <Link href="/login">Acessar Plataforma</Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 text-primary hover:bg-muted rounded-lg transition-colors"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <nav className="md:hidden py-4 border-t border-border">
            <div className="flex flex-col gap-4">
              <Link
                href="/"
                className="text-foreground hover:text-primary transition-colors font-medium py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Início
              </Link>
              <Link
                href="/recursos"
                className="text-foreground hover:text-primary transition-colors font-medium py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Recursos
              </Link>
              <Link
                href="/clube"
                className="text-foreground hover:text-primary transition-colors font-medium py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Clube de Assinatura
              </Link>
              <Link
                href="/contato"
                className="text-foreground hover:text-primary transition-colors font-medium py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Fale Conosco
              </Link>
              <Button
                asChild
                className="bg-accent hover:bg-accent-dark text-primary font-semibold rounded-full mt-2"
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
