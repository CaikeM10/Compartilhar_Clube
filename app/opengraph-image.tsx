import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Imagem institucional de compartilhamento (Open Graph / Twitter), gerada como PNG estático no build.
// Usa somente assets oficiais: o logotipo branco (public/logoo.png, recortado e reduzido em assets/og) e o símbolo
// (public/logoo.webp, reduzido). Cores da marca: #2f4a70 (azul) e #e1b12c (dourado). Fonte: Poppins (OFL, assets/fonts).
export const alt = "Compartilhar Clube — Psicologia, Educação e Inclusão: aulas, supervisões e materiais"; // igual a OG_IMAGE.alt (lib/seo.ts)
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const asset = (...parts: string[]) => readFile(join(process.cwd(), "assets", ...parts));
const dataUri = (bytes: Buffer) => `data:image/png;base64,${bytes.toString("base64")}`;

export default async function OpenGraphImage() {
  const [logotipo, simbolo, semiBold, medium] = await Promise.all([
    asset("og", "logotipo-branco.png"), asset("og", "simbolo.png"),
    asset("fonts", "Poppins-SemiBold.ttf"), asset("fonts", "Poppins-Medium.ttf"),
  ]);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", fontFamily: "Poppins", color: "#ffffff",
        background: "linear-gradient(135deg, #34537d 0%, #2f4a70 45%, #233a5a 100%)" }}>
        {/* Anel decorativo discreto, com margem de segurança para recortes */}
        <div style={{ position: "absolute", right: -170, top: -150, width: 700, height: 700, borderRadius: 9999, display: "flex",
          border: "2px solid rgba(225, 177, 44, 0.22)" }} />
        <div style={{ position: "absolute", right: -90, top: -70, width: 540, height: 540, borderRadius: 9999, display: "flex",
          background: "rgba(255, 255, 255, 0.035)" }} />

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 88, width: 740 }}>
          <img src={dataUri(logotipo)} width={540} height={151} alt="" />
          <div style={{ display: "flex", width: 88, height: 6, borderRadius: 3, background: "#e1b12c", marginTop: 46, marginBottom: 30 }} />
          <div style={{ display: "flex", flexDirection: "column", fontSize: 50, fontWeight: 600, lineHeight: 1.16, letterSpacing: -0.5 }}>
            <span>Psicologia, Educação</span>
            <span>e Inclusão</span>
          </div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 500, color: "rgba(255, 255, 255, 0.8)", marginTop: 18 }}>
            Aulas  •  Supervisões  •  Materiais
          </div>
        </div>

        <div style={{ position: "absolute", right: 112, top: 165, width: 300, height: 300, borderRadius: 9999, background: "#ffffff",
          display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 28px 70px rgba(10, 22, 40, 0.35)" }}>
          {/* O símbolo oficial tem fundo branco quadrado: 200 px cabe inteiro no círculo de 300 px (diagonal < diâmetro). */}
          <img src={dataUri(simbolo)} width={200} height={200} alt="" />
        </div>

        <div style={{ position: "absolute", left: 88, bottom: 50, display: "flex", fontSize: 24, fontWeight: 500, color: "#e1b12c", letterSpacing: 0.3 }}>
          compartilharclube.com.br
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Poppins", data: semiBold, weight: 600, style: "normal" },
        { name: "Poppins", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
}
