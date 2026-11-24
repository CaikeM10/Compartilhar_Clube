import type { ReactNode } from "react";
import type { Metadata } from "next";
import { NO_INDEX } from "@/lib/seo";

export const metadata: Metadata = { title: "Recuperar senha", robots: NO_INDEX };

export default function RecuperarSenhaLayout({ children }: { children: ReactNode }) {
  return children;
}
