/** @type {import('next').NextConfig} */

// Páginas privadas ou transacionais: fora do índice dos buscadores (também para respostas que não são HTML,
// como redirecionamentos para /login). Não protege acesso: a autorização continua no servidor.
// As capas públicas (/api/materials/covers/*) e as páginas públicas não recebem este cabeçalho.
const NO_INDEX_PATHS = [
  "/admin", "/admin/:path*", "/aluno", "/aluno/:path*", "/conta/:path*",
  "/checkout", "/checkout/:path*", "/login", "/recuperar-senha",
];

const nextConfig = {
  allowedDevOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.3.90:3000",
  ],
  async headers() {
    return NO_INDEX_PATHS.map(source => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }] }));
  },
};

module.exports = nextConfig;
