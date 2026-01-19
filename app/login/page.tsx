"use client";

import type React from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Lock, Mail, ArrowLeft, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      await login(email, password);
      router.push("/aluno/dashboard");
    } catch (err) {
      setError(
        "E-mail ou senha incorretos. Verifique seus dados e tente novamente.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary to-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao site</span>
          </Link>

          {/* Logo oficial */}
          <div className="flex justify-center mb-6">
            <img
              src="/logo.png"
              alt="Compartilhar Clube"
              className="w-20 h-20 object-contain"
            />
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-white font-display">
            Área de Membros – Compartilhar Clube
          </h1>
          <p className="text-white/80 mt-2 max-w-md mx-auto">
            Conteúdos exclusivos para profissionais da educação e saúde mental
          </p>
        </div>

        {/* Card */}
        <Card className="p-8 md:p-10 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Digite seu e-mail"
                  className="pl-10"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex justify-end text-sm">
              <Link
                href="/recuperar-senha"
                className="text-primary hover:text-primary/80 transition-colors"
              >
                Esqueceu sua senha?
              </Link>
            </div>

            {/* CTA */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-accent hover:bg-accent-dark text-primary font-bold rounded-full text-base"
              size="lg"
            >
              {isLoading ? "Acessando..." : "Entrar na Plataforma"}
            </Button>

            {/* Trust */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="w-4 h-4 text-accent" />
              <span>Acesso seguro • Área restrita a membros</span>
            </div>

            {/* CTA secundário */}
            <div className="text-center text-sm text-muted-foreground">
              Ainda não faz parte do clube?{" "}
              <Link
                href="/contato"
                className="text-primary hover:text-primary/80 font-semibold transition-colors"
              >
                Solicite acesso ou fale conosco
              </Link>
            </div>
          </form>
        </Card>

        {/* Legal */}
        <p className="text-center text-white/60 text-xs mt-6 max-w-md mx-auto">
          Ao acessar, você concorda com nossos{" "}
          <Link href="/termos" className="underline hover:text-white">
            Termos de Uso
          </Link>{" "}
          e{" "}
          <Link href="/privacidade" className="underline hover:text-white">
            Política de Privacidade
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
