import type { ReactNode } from "react";
import type { Metadata } from "next";
import { NO_INDEX } from "@/lib/seo";

// Área da conta (troca de senha): fora do índice. A proteção de acesso continua na própria página.
export const metadata: Metadata = { title: "Minha conta", robots: NO_INDEX };

export default function ContaLayout({ children }: { children: ReactNode }) {
  return children;
}
