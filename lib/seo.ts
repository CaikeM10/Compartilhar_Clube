import type { Metadata } from "next";

/** Domínio canônico (com www). Todas as URLs absolutas de SEO derivam daqui. */
export const SITE_URL = "https://www.compartilharclube.com.br";
export const SITE_NAME = "Compartilhar Clube";
export const DEFAULT_TITLE = "Compartilhar Clube | Psicologia, Educação e Inclusão";
export const DEFAULT_DESCRIPTION =
  "Formação continuada para psicólogos, professores e psicopedagogos: aulas, supervisões e materiais para a prática em Psicologia, Educação e Inclusão.";

/** Imagem institucional (app/opengraph-image.tsx). Declarada explicitamente porque, quando uma página define o próprio
 * openGraph, o Next não herda a imagem gerada pela convenção de arquivo. URL absoluta via metadataBase, pública e fixa. */
export const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "Compartilhar Clube — Psicologia, Educação e Inclusão: aulas, supervisões e materiais",
};

/** Páginas privadas ou transacionais: fora do índice, mas os links continuam sendo seguidos. */
export const NO_INDEX: Metadata["robots"] = { index: false, follow: true, googleBot: { index: false, follow: true } };

type PageSeo = { title: string; description: string; path: string; absoluteTitle?: boolean };

/**
 * Metadados de uma página pública indexável: título exclusivo, descrição, canônico com www, Open Graph e Twitter.
 * Em cada página o Next substitui (não mescla) o objeto openGraph do layout, por isso ele é montado completo aqui.
 * A imagem institucional (OG_IMAGE) é incluída explicitamente, pelo mesmo motivo.
 */
export function pageMetadata({ title, description, path, absoluteTitle = false }: PageSeo): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", locale: "pt_BR", siteName: SITE_NAME, url: path, title: fullTitle, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [OG_IMAGE] },
  };
}

/** Serializa JSON-LD com segurança para <script>: impede o fechamento prematuro da tag. */
export function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function breadcrumb(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: `${SITE_URL}${item.path}` })),
  };
}
