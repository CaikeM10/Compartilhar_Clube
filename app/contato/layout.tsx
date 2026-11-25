import type { ReactNode } from "react";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumb, pageMetadata } from "@/lib/seo";

// A página é um Client Component (formulário); os metadados e os dados estruturados ficam neste layout de servidor.
export const metadata = pageMetadata({
  title: "Contato",
  description: "Fale com o Compartilhar Clube por formulário, e-mail ou WhatsApp e tire suas dúvidas sobre aulas, supervisões, materiais e planos de assinatura.",
  path: "/contato",
});

export default function ContatoLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <JsonLd data={breadcrumb([{ name: "Início", path: "/" }, { name: "Contato", path: "/contato" }])} />
      {children}
    </>
  );
}
