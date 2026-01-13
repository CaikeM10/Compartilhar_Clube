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
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent">
                <img src="/logoo.png" alt="Logo" className="w-6 h-6" />
              </div>
              <span className="text-lg font-bold font-display">
                Compartilhar Clube
              </span>
            </div>
            <p className="text-white/80 leading-relaxed">
              Uma comunidade de aprendizagem, troca e formação continuada para
              profissionais da educação e saúde mental.
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
                  href="/recursos"
                  className="text-white/80 hover:text-accent transition-colors"
                >
                  Recursos
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
                  href="mailto:contato@compartilharclube.com.br"
                  className="hover:text-accent transition-colors"
                >
                  contato@compartilharclube.com.br
                </a>
              </li>
              <li className="flex items-center gap-3 text-white/80">
                <Phone size={20} className="text-accent" />
                <a
                  href="https://wa.me/5511999999999"
                  className="hover:text-accent transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  (11) 99999-9999
                </a>
              </li>
              <li className="flex items-center gap-3 text-white/80">
                <Instagram size={20} className="text-accent" />
                <a
                  href="https://instagram.com/compartilharclube"
                  className="hover:text-accent transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  @compartilharclube
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/20 mt-8 pt-8 text-center text-white/60 text-sm">
          <p>
            © {new Date().getFullYear()} Compartilhar Clube. Todos os direitos
            reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
