import type { ReactNode } from "react";
import type { Metadata } from "next";
import { NO_INDEX } from "@/lib/seo";

// Página de autenticação: fora do índice (o acesso continua igual; nada aqui altera o login).
export const metadata: Metadata = { title: "Entrar", robots: NO_INDEX };

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
