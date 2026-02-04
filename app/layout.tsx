import type React from "react";
import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Compartilhar Clube | Comunidade de Aprendizagem e Formação",
  description:
    "Espaço de conexão, aprendizado coletivo e formação continuada para professores, psicólogos, psicopedagogos e profissionais da educação.",

  icons: {
    icon: "/favicon.png",
    shortcut: "/icon.png",
    apple: "/apple-icon.png",
  },

  openGraph: {
    title: "Compartilhar Clube",
    description:
      "Comunidade de aprendizagem e formação continuada para profissionais da educação.",
    url: "https://compartilharclube.com.br",
    siteName: "Compartilhar Clube",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Compartilhar Clube",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },

  metadataBase: new URL("https://compartilharclube.com.br"),
  generator: "v0.pp",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${poppins.variable} font-sans antialiased`}
      >
        <AuthProvider>{children}</AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
