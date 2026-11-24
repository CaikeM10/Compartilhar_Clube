import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Somente páginas públicas, canônicas e indexáveis, com o domínio www. Sem datas de atualização: o projeto não registra
 * a data real de alteração dessas páginas, e uma data fictícia seria pior do que nenhuma.
 * Páginas individuais de materiais entrarão aqui quando existirem (somente PUBLISHED).
 */
const PUBLIC_PATHS = ["/", "/clube", "/materiais", "/recursos", "/contato"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map(path => ({ url: path === "/" ? SITE_URL : `${SITE_URL}${path}` }));
}
