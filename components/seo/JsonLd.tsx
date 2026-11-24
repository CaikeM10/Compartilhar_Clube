import { jsonLd } from "@/lib/seo";

/** Dados estruturados no HTML inicial (Server Component: não depende de JavaScript no cliente). */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}
