import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Container } from "@/components/layout/Container";
import { ScrollAnimation } from "@/components/ScrollAnimation";
import { SectionDivider } from "@/components/SectionDivider";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Video, FileText, MessagesSquare, Check, Brain } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <section className="bg-gradient-to-br from-primary via-primary to-secondary py-20 md:py-32">
        <Container>
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left Side - CTA Content */}
            <ScrollAnimation animation="fade-up">
              <div className="text-white">
                {/* Logo */}
                <div className="mb-8 flex justify-center md:justify-start">
                  <Image
                    src="/logoo.png"
                    alt="Compartilhar Clube"
                    width={120}
                    height={120}
                    className="drop-shadow-lg"
                  />
                </div>

                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 font-display text-balance leading-tight">
                  Transforme sua prática profissional com conhecimento
                  compartilhado
                </h1>
                <p className="text-lg md:text-xl mb-8 text-white/90 leading-relaxed text-pretty">
                  Junte-se a uma comunidade de educadores e profissionais da
                  saúde mental dedicados ao crescimento, aprendizado e trocas
                  significativas.
                </p>
                <Button
                  asChild
                  size="lg"
                  className="bg-accent hover:bg-accent-dark text-primary font-bold text-lg px-8 py-4 rounded-full shadow-lg hover:shadow-xl transition-all group"
                >
                  <Link href="#planos" className="flex items-center gap-2">
                    <Brain className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    Faça parte do clube
                  </Link>
                </Button>
              </div>
            </ScrollAnimation>

            {/* Right Side - Photo */}
            <ScrollAnimation animation="fade-up" delay={200}>
              <div className="relative">
                <div className="relative w-full max-w-md mx-auto aspect-square rounded-2xl overflow-hidden shadow-2xl border-4 border-accent/30">
                  <Image
                    src="/descriptionWesley.jpg"
                    alt="Psicólogo Wesley Marques"
                    fill
                    className="object-cover"
                    priority
                  />
                </div>
                {/* Decorative element */}
                <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-accent/20 rounded-full blur-3xl -z-10" />
              </div>
            </ScrollAnimation>
          </div>
        </Container>
      </section>

      <SectionDivider variant="wave" />

      {/* O que é o Compartilhar Clube */}
      <section className="py-20 bg-background">
        <Container>
          <ScrollAnimation animation="fade-up">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-6 font-display">
                O que é o Compartilhar Clube
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                O <strong className="text-primary">Compartilhar Clube</strong> é
                muito mais que uma plataforma de cursos. É um espaço vivo de{" "}
                <strong>conexão humana</strong>, onde profissionais da educação
                e saúde mental se encontram para compartilhar experiências,
                aprender juntos e crescer de forma contínua.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed mt-4">
                Aqui, você faz parte de uma{" "}
                <strong>comunidade profissional acolhedora</strong>, que
                valoriza o conhecimento compartilhado, a troca de saberes e o
                desenvolvimento constante.
              </p>
            </div>
          </ScrollAnimation>
        </Container>
      </section>

      <SectionDivider variant="curve" flip />

      {/* O que você encontra no clube */}
      <section className="py-20 bg-muted/30">
        <Container>
          <ScrollAnimation animation="fade-up">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4 font-display">
                O que você encontra no clube
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Recursos práticos, conteúdo de qualidade e suporte profissional
                para transformar sua prática
              </p>
            </div>
          </ScrollAnimation>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <ScrollAnimation animation="scale" delay={100}>
              <Card className="p-8 hover:shadow-lg transition-shadow h-full">
                <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Video className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-primary mb-3 font-display">
                  Aulas semanais e/ou quinzenais
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  Aulas gravadas, com conteúdo prático e aplicado, além de
                  oportunidades de networking com outros profissionais da área.
                </p>
              </Card>
            </ScrollAnimation>

            <ScrollAnimation animation="scale" delay={200}>
              <Card className="p-8 hover:shadow-lg transition-shadow h-full">
                <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <FileText className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-primary mb-3 font-display">
                  Disponibilização de recursos
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  Recursos digitais em PDF, prontos para impressão, criativos e
                  aplicáveis diretamente na sua prática profissional.
                </p>
              </Card>
            </ScrollAnimation>

            <ScrollAnimation animation="scale" delay={300}>
              <Card className="p-8 hover:shadow-lg transition-shadow h-full">
                <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <MessagesSquare className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-primary mb-3 font-display">
                  Suporte
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  Supervisões, mentorias, orientações e estudos de caso
                  (coletivos ou individuais) para apoiar seu desenvolvimento.
                </p>
                <p className="text-sm text-muted-foreground italic border-t pt-4 mt-4">
                  <strong>Observação ética:</strong> Estudos de caso coletivos
                  da clínica psicológica são exclusivos para psicólogos,
                  respeitando sigilo e ética profissional.
                </p>
              </Card>
            </ScrollAnimation>
          </div>
        </Container>
      </section>

      <SectionDivider variant="wave" flip />

      <section id="planos" className="py-20 bg-background scroll-mt-20">
        <Container>
          <ScrollAnimation animation="fade-up">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4 font-display">
                Escolha seu plano
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Invista no seu desenvolvimento profissional com planos flexíveis
                e acessíveis
              </p>
            </div>
          </ScrollAnimation>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Plano Mensal */}
            <ScrollAnimation animation="scale" delay={100}>
              <Card className="p-8 hover:shadow-xl transition-all relative overflow-hidden h-full flex flex-col">
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-primary mb-2 font-display">
                    Mensal
                  </h3>
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-primary">
                      R$ 49
                    </span>
                    <span className="text-muted-foreground">/mês</span>
                  </div>
                  <ul className="space-y-3 mb-8">
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">
                        Acesso a todas as aulas
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">
                        Recursos em PDF
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">
                        Comunidade exclusiva
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">
                        Certificado de participação
                      </span>
                    </li>
                  </ul>
                </div>
                <Button
                  asChild
                  className="w-full bg-primary hover:bg-primary/90 text-white rounded-full"
                >
                  <Link href="/clube">Começar agora</Link>
                </Button>
              </Card>
            </ScrollAnimation>

            {/* Plano Trimestral - Destaque */}
            <ScrollAnimation animation="scale" delay={200}>
              <Card className="p-8 hover:shadow-xl transition-all relative overflow-hidden border-2 border-accent h-full flex flex-col">
                <div className="absolute top-0 right-0 bg-accent text-primary text-xs font-bold px-3 py-1 rounded-bl-lg">
                  POPULAR
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-primary mb-2 font-display">
                    Trimestral
                  </h3>
                  <div className="mb-2">
                    <span className="text-4xl font-bold text-primary">
                      R$ 129
                    </span>
                    <span className="text-muted-foreground">/3 meses</span>
                  </div>
                  <p className="text-sm text-accent font-semibold mb-6">
                    Economize R$ 18
                  </p>
                  <ul className="space-y-3 mb-8">
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">
                        Acesso a todas as aulas
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">
                        Recursos em PDF
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">
                        Comunidade exclusiva
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">
                        Certificado de participação
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground font-semibold">
                        1 supervisão em grupo
                      </span>
                    </li>
                  </ul>
                </div>
                <Button
                  asChild
                  className="w-full bg-accent hover:bg-accent-dark text-primary rounded-full font-bold"
                >
                  <Link href="/clube">Assinar agora</Link>
                </Button>
              </Card>
            </ScrollAnimation>

            {/* Plano Anual */}
            <ScrollAnimation animation="scale" delay={300}>
              <Card className="p-8 hover:shadow-xl transition-all relative overflow-hidden h-full flex flex-col">
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-primary mb-2 font-display">
                    Anual
                  </h3>
                  <div className="mb-2">
                    <span className="text-4xl font-bold text-primary">
                      R$ 449
                    </span>
                    <span className="text-muted-foreground">/ano</span>
                  </div>
                  <p className="text-sm text-accent font-semibold mb-6">
                    Economize R$ 139
                  </p>
                  <ul className="space-y-3 mb-8">
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">
                        Acesso a todas as aulas
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">
                        Recursos em PDF
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">
                        Comunidade exclusiva
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">
                        Certificado de participação
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground font-semibold">
                        4 supervisões em grupo
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground font-semibold">
                        Suporte prioritário
                      </span>
                    </li>
                  </ul>
                </div>
                <Button
                  asChild
                  className="w-full bg-primary hover:bg-primary/90 text-white rounded-full"
                >
                  <Link href="/clube">Assinar agora</Link>
                </Button>
              </Card>
            </ScrollAnimation>
          </div>
        </Container>
      </section>

      <SectionDivider variant="curve" flip />

      {/* CTA Final */}
      <section className="py-20 bg-primary text-white">
        <Container>
          <ScrollAnimation animation="fade-up">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-6 font-display">
                Pronto para fazer parte?
              </h2>
              <p className="text-xl mb-8 text-white/90 leading-relaxed">
                Junte-se a uma comunidade de profissionais dedicados ao
                crescimento e ao compartilhamento de conhecimento.
              </p>
              <Button
                asChild
                size="lg"
                className="bg-accent hover:bg-accent-dark text-primary font-bold text-lg px-8 py-6 rounded-full shadow-lg group"
              >
                <Link href="#planos" className="flex items-center gap-2">
                  <Brain className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  Quero fazer parte
                </Link>
              </Button>
            </div>
          </ScrollAnimation>
        </Container>
      </section>

      <SectionDivider variant="gradient" />

      {/* Quem criou o clube */}
      <section className="py-20 bg-background">
        <Container>
          <ScrollAnimation animation="fade-up">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4 font-display">
                Quem criou o Compartilhar Clube
              </h2>
            </div>
          </ScrollAnimation>

          <div className="max-w-4xl mx-auto">
            <ScrollAnimation animation="fade-up" delay={100}>
              <Card className="p-8 md:p-12 border-2 shadow-lg">
                <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
                  {/* Photo */}
                  <div className="flex-shrink-0">
                    <div className="w-48 h-48 rounded-full overflow-hidden bg-gradient-to-br from-primary to-secondary p-1">
                      <div className="w-full h-full rounded-full overflow-hidden bg-muted flex items-center justify-center">
                        <Image
                          src="/descriptionWesley.jpg"
                          alt="Wesley Marques"
                          width={192}
                          height={192}
                          className="object-cover"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 text-center md:text-left">
                    <h3 className="text-2xl md:text-3xl font-bold text-primary mb-2 font-display">
                      Wesley Marques
                    </h3>
                    <div className="text-lg text-muted-foreground mb-6 space-y-1">
                      <p className="font-semibold">Psicólogo – CRP 11/23403</p>
                      <p>Psicopedagogo</p>
                      <p>Pedagogo</p>
                    </div>
                    <div className="space-y-4 text-muted-foreground leading-relaxed">
                      <p>
                        Com ampla experiência na educação e psicologia, Wesley
                        Marques dedica sua carreira à{" "}
                        <strong className="text-primary">
                          infância, inclusão e alfabetização
                        </strong>
                        .
                      </p>
                      <p>
                        Atuando na{" "}
                        <strong className="text-primary">
                          educação pública
                        </strong>{" "}
                        e em consultório clínico, ele acredita profundamente no
                        poder do{" "}
                        <strong className="text-primary">
                          conhecimento compartilhado
                        </strong>{" "}
                        e na importância da{" "}
                        <strong className="text-primary">
                          formação ética e continuada
                        </strong>{" "}
                        de profissionais que trabalham com crianças e
                        adolescentes.
                      </p>
                      <p>
                        O{" "}
                        <strong className="text-primary">
                          Compartilhar Clube
                        </strong>{" "}
                        nasce dessa paixão: criar um espaço onde{" "}
                        <strong className="text-primary">
                          afeto, aprendizado e colaboração
                        </strong>{" "}
                        se encontram para transformar práticas e vidas.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </ScrollAnimation>
          </div>
        </Container>
      </section>

      <SectionDivider variant="curve" />

      <Footer />

      <WhatsAppFloat />
    </div>
  );
}
