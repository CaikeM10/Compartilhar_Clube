import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * robots.txt. Não é mecanismo de segurança: o acesso é protegido no servidor.
 * As páginas privadas (admin, aluno, conta, login, recuperação de senha, checkout) NÃO são bloqueadas aqui de propósito:
 * elas recebem noindex (metadados e X-Robots-Tag, em next.config.js), e um bloqueio no robots.txt impediria os
 * buscadores de ler esse noindex. Só os endpoints internos de API são bloqueados, exceto as capas públicas dos materiais,
 * que precisam ser lidas pelo Google Imagens e pelas prévias das redes sociais.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/api/materials/covers/"], disallow: ["/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
