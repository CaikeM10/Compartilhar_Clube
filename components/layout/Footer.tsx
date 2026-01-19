import Link from "next/link";
import { Mail, Phone, Instagram } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-primary text-white mt-20">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* About */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              {/* Logo igual ao header */}
              <img
                src="/logo.png"
                alt="Compartilhar Clube"
                className="h-12 w-auto"
              />
              <span className="text-lg font-bold font-display">
                Compartilhar Clube
              </span>
            </div>

            <p className="text-white/80 leading-relaxed">
              Uma comunidade de aprendizagem, troca e formação continuada para
              profissionais da educação e da saúde mental, com foco em
              crescimento e prática profissional.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold mb-4 font-display">
              Links Rápidos
            </h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/"
                  className="text-white/80 hover:text-accent transition-colors"
                >
                  Início
                </Link>
              </li>
              <li>
                <Link
                  href="/clube"
                  className="text-white/80 hover:text-accent transition-colors"
                >
                  Clube de Assinatura
                </Link>
              </li>
              <li>
                <Link
                  href="/recursos"
                  className="text-white/80 hover:text-accent transition-colors"
                >
                  Recursos
                </Link>
              </li>
              <li>
                <Link
                  href="/contato"
                  className="text-white/80 hover:text-accent transition-colors"
                >
                  Fale Conosco
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-lg font-semibold mb-4 font-display">Contato</h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-white/80">
                <Mail size={20} className="text-accent" />
                <a
                  href="mailto:compartilharclube@gmail.com"
                  className="hover:text-accent transition-colors"
                >
                  compartilharclube@gmail.com
                </a>
              </li>

              <li className="flex items-center gap-3 text-white/80">
                <Phone size={20} className="text-accent" />
                <a
                  href="https://wa.me/558592483382"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-accent transition-colors"
                >
                  (85) 92483-382
                </a>
              </li>

              <li className="flex items-center gap-3 text-white/80">
                <Instagram size={20} className="text-accent" />
                <a
                  href="https://www.instagram.com/compartilharclube"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-accent transition-colors"
                >
                  @compartilharclube
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-white/20 mt-10 pt-6 text-center text-white/60 text-sm space-y-2">
          <p>
            © {new Date().getFullYear()} Compartilhar Clube. Todos os direitos
            reservados.
          </p>

          <p>
            Desenvolvido por{" "}
            <a
              href="https://www.caikemarinho.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline font-medium"
            >
              Caike Marinho
            </a>{" "}
            | Soluções Web Profissionais.
          </p>
        </div>
      </div>
    </footer>
  );
}
