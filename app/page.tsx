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
              <div className="text-white text-center md:text-left">
                {/* Logo */}
                <div className="mb-10 flex justify-center md:justify-start">
                  <div className="relative w-36 h-36 md:w-36 md:h-36">
                    <Image
                      src="/logoo.png"
                      alt="Compartilhar Clube"
                      fill
                      className="object-contain drop-shadow-lg"
                      priority
                    />
                  </div>
                </div>

                <h1 className="text-4xl sm:text-5xl md:text-4xl lg:text-5xl font-bold mb-6 font-display leading-tight md:max-w-xl mx-auto md:mx-0">
                  Transforme sua prática profissional
                  <br />
                  <span className="text-accent">
                    com conhecimento compartilhado
                  </span>
                </h1>

                <p className="text-lg md:text-xl mb-8 text-white/90 leading-relaxed md:max-w-xl mx-auto md:mx-0">
                  Junte-se a uma comunidade de educadores e profissionais da
                  saúde mental dedicados ao crescimento, aprendizado e trocas
                  significativas.
                </p>

                {/* CTA DESKTOP (posição original) */}
                <div className="hidden md:flex">
                  <Button
                    asChild
                    size="lg"
                    className="bg-gradient-to-r from-accent to-[#f3c969] hover:brightness-110 
                         text-primary font-bold text-xl px-12 py-5 rounded-full 
                         shadow-lg hover:shadow-xl transition-all group"
                  >
                    <Link href="#planos" className="flex items-center gap-3">
                      Faça parte do clube
                      <Brain className="w-6 h-6 transition-transform group-hover:scale-110" />
                    </Link>
                  </Button>
                </div>
              </div>
            </ScrollAnimation>

            {/* RIGHT IMAGE */}
            <ScrollAnimation animation="fade-up" delay={200}>
              <div className="relative flex flex-col items-center">
                {/* GLOW */}
                <div className="absolute inset-0 flex items-center justify-center -z-10">
                  <div className="w-72 h-72 md:w-80 md:h-80 bg-gradient-to-br from-accent/40 to-[#f3c969]/30 rounded-full blur-3xl" />
                </div>

                {/* IMAGE */}
                <div className="relative w-full max-w-sm aspect-square rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                  <Image
                    src="/imagem_principal.webp"
                    alt="Psicólogo Wesley Marques"
                    fill
                    priority
                    className="object-cover"
                  />
                </div>

                {/* CTA MOBILE */}
                <div className="mt-10 md:hidden w-full flex justify-center">
                  <Button
                    asChild
                    size="lg"
                    className="bg-gradient-to-r from-accent to-[#f3c969] hover:brightness-110 
                         text-primary font-bold text-xl px-12 py-5 rounded-full 
                         shadow-lg transition-all group"
                  >
                    <Link href="#planos" className="flex items-center gap-3">
                      Faça parte do clube
                      <Brain className="w-6 h-6 transition-transform group-hover:scale-110" />
                    </Link>
                  </Button>
                </div>
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
            {/* ================= PLANO MENSAL ================= */}
            <ScrollAnimation animation="scale" delay={100}>
              <Card className="p-8 hover:shadow-xl transition-all h-full flex flex-col">
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-primary mb-4 font-display">
                    Mensal
                  </h3>

                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-4xl font-bold text-primary">
                      R$ 59
                    </span>
                    <span className="text-sm text-muted-foreground">/mês</span>
                  </div>

                  <ul className="space-y-3 mb-8">
                    {[
                      "Acesso a todas as aulas",
                      "Recursos em PDF",
                      "Clube exclusivo",
                      "Acesso ao grupo VIP do WhatsApp",
                      "1 supervisão em grupo",
                    ].map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <Check className="w-5 h-5 text-accent mt-0.5" />
                        <span className="text-muted-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  asChild
                  className="w-full bg-primary hover:bg-primary/90 text-white rounded-full"
                >
                  <Link href="/checkout?plan=mensal">Começar agora</Link>
                </Button>
              </Card>
            </ScrollAnimation>

            {/* ================= PLANO TRIMESTRAL ================= */}
            <ScrollAnimation animation="scale" delay={200}>
              <Card className="p-8 border-2 border-accent hover:shadow-xl transition-all relative h-full flex flex-col">
                <div className="absolute top-0 right-0 bg-accent text-primary text-xs font-bold px-3 py-1 rounded-bl-lg">
                  POPULAR
                </div>

                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-primary mb-4 font-display">
                    Trimestral
                  </h3>

                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-4xl font-bold text-primary">
                      R$ 139
                    </span>
                    <span className="text-sm text-muted-foreground">
                      (49,90/mês)
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">3 meses</span>

                  <p className="text-sm text-accent font-semibold mt-4 mb-6">
                    Economize R$ 38
                  </p>

                  <ul className="space-y-3 mb-8">
                    {[
                      "Acesso a todas as aulas",
                      "Recursos em PDF",
                      "Clube exclusivo",
                      "Acesso ao Grupo VIP no WhatsApp",
                      "Supervisão em grupo",
                      "1 supervisão individual",
                    ].map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <Check className="w-5 h-5 text-accent mt-0.5" />
                        <span
                          className={`text-muted-foreground ${
                            item.includes("individual") && "font-semibold"
                          }`}
                        >
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  asChild
                  className="w-full bg-accent hover:bg-accent/90 text-primary rounded-full font-bold"
                >
                  <Link href="/checkout?plan=trimestral">Assinar agora</Link>
                </Button>
              </Card>
            </ScrollAnimation>

            {/* ================= PLANO ANUAL ================= */}
            <ScrollAnimation animation="scale" delay={300}>
              <Card className="p-8 hover:shadow-xl transition-all h-full flex flex-col">
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-primary mb-4 font-display">
                    Anual
                  </h3>

                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-4xl font-bold text-primary">
                      R$ 499
                    </span>
                    <span className="text-sm text-muted-foreground">
                      (39,90/mês)
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">ano</span>

                  <p className="text-sm text-accent font-semibold mt-4 mb-6">
                    Economize R$ 209
                  </p>

                  <ul className="space-y-3 mb-8">
                    {[
                      "Acesso a todas as aulas",
                      "Recursos em PDF",
                      "Clube exclusivo",
                      "Acesso ao Grupo VIP no WhatsApp",
                      "Supervisão em grupo",
                      "4 supervisões em grupo",
                    ].map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <Check className="w-5 h-5 text-accent mt-0.5" />
                        <span className="text-muted-foreground font-semibold">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  asChild
                  className="w-full bg-primary hover:bg-primary/90 text-white rounded-full"
                >
                  <Link href="/checkout?plan=anual">Assinar agora</Link>
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
                  Quero fazer parte
                  <Brain className="w-5 h-5 group-hover:scale-110 transition-transform" />
                </Link>
              </Button>
            </div>
          </ScrollAnimation>
        </Container>
      </section>
      <SectionDivider variant="gradient" />

      {/* ================= MATERIAIS INDIVIDUAIS ================= */}
      <section className="relative py-24 bg-background overflow-hidden">
        <Container>
          {/* TÍTULO */}
          <ScrollAnimation animation="fade-up">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4 font-display">
                Materiais Individuais
              </h2>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                Prefere adquirir apenas um material específico? Recursos prontos
                em PDF para uso imediato, sem assinatura.
              </p>
            </div>
          </ScrollAnimation>

          {/* ================= CARROSSEL ================= */}
          <ScrollAnimation animation="fade-up" delay={150}>
            <div className="relative overflow-hidden">
              <div
                className="
            flex gap-8
            animate-materials-scroll
            hover:[animation-play-state:paused]
            will-change-transform
          "
              >
                {[
                  {
                    title: "Marmita da Leitura",
                    image: "/marmitadaleitura.webp",
                  },
                  {
                    title: "Caçadores de Palavras",
                    image: "/caçadoresdepalavras.webp",
                  },
                  { title: "Arraiá da Alfabetização", image: "/arraiá.webp" },
                  { title: "Mood Kids", image: "/moodkids.webp" },
                  { title: "Varal Literário", image: "/varalliterário.webp" },
                  { title: "Pipoca com Rima", image: "/pipocacomrima.webp" },
                  {
                    title: "Jogo da Memória com Alfabeto",
                    image: "/jogodamemória.webp",
                  },
                  { title: "Letras Iguais", image: "/letrasiguais.webp" },
                  {
                    title: "Não aceitamos fiado",
                    image: "/não_aceitamos_fiado.webp",
                  },
                  {
                    title: "Aprendendo Felicidade",
                    image: "/aprendendofelicidade.webp",
                  },

                  /* DUPLICAÇÃO PARA LOOP */
                  {
                    title: "Marmita da Leitura",
                    image: "/marmitadaleitura.webp",
                  },
                  {
                    title: "Caçadores de Palavras",
                    image: "/caçadoresdepalavras.webp",
                  },
                  { title: "Arraiá da Alfabetização", image: "/arraiá.webp" },
                  { title: "Mood Kids", image: "/moodkids.webp" },
                  { title: "Varal Literário", image: "/varalliterário.webp" },
                  { title: "Pipoca com Rima", image: "/pipocacomrima.webp" },
                  {
                    title: "Jogo da Memória com Alfabeto",
                    image: "/jogodamemória.webp",
                  },
                  { title: "Letras Iguais", image: "/letrasiguais.webp" },
                  {
                    title: "Não aceitamos fiado",
                    image: "/não_aceitamos_fiado.webp",
                  },
                  {
                    title: "Aprendendo Felicidade",
                    image: "/aprendendofelicidade.webp",
                  },
                ].map((item, index) => (
                  <a
                    key={index}
                    href="/materiais"
                    className="
                min-w-[260px]
                bg-white
                rounded-2xl
                overflow-hidden
                border border-border/60
                transition-transform duration-300
                hover:scale-[1.03]
              "
                  >
                    {/* IMAGEM */}
                    <div className="relative h-[330px] overflow-hidden">
                      <img
                        src={item.image}
                        alt={item.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
                    </div>

                    {/* TEXTO */}
                    <div className="p-5">
                      <h3 className="font-semibold text-primary text-lg text-center">
                        {item.title}
                      </h3>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </ScrollAnimation>

          {/* ================= CTA ================= */}
          <ScrollAnimation animation="fade-up" delay={300}>
            <div className="mt-16 text-center">
              <Button
                asChild
                size="lg"
                className="bg-gradient-to-r from-accent to-[#f3c969] hover:brightness-110 text-primary font-bold px-10 py-6 rounded-full shadow-xl"
              >
                <Link href="/materiais">Explorar materiais individuais</Link>
              </Button>
            </div>
          </ScrollAnimation>
        </Container>

        {/* ================= ONDA / DIVISOR ================= */}
        <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-none">
          <svg
            viewBox="0 0 1200 120"
            preserveAspectRatio="none"
            className="w-full h-24"
          >
            <path
              d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,
        70.36-5.37,136.33-33.31,206.8-37.5
        C438.64,32.43,512.34,53.67,583,72.05
        c69.27,18,138.3,24.88,209.4,13.08
        36.15-6,69.85-17.84,104.45-29.34
        C989.49,25,1113-14.29,1200,52.47V0Z"
              className="fill-muted"
            />
          </svg>
        </div>
      </section>

      {/* Quem criou o clube */}
      <section className="py-20 bg-background">
        <Container>
          <ScrollAnimation animation="fade-up">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4 font-display">
                Quem criou o Compartilhar Clube ?
              </h2>
            </div>
          </ScrollAnimation>

          <div className="max-w-4xl mx-auto">
            <ScrollAnimation animation="fade-up" delay={100}>
              <Card className="p-8 md:p-12 border-2 shadow-lg">
                <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
                  {/* Photo */}
                  <div className="shrink-0">
                    <div className="w-48 h-48 rounded-full overflow-hidden bg-linear-to-br from-primary to-secondary p-1">
                      <div className="w-full h-full rounded-full overflow-hidden bg-muted flex items-center justify-center">
                        <Image
                          src="/imagem_principal.webp"
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
                        Olá, como vai? É um prazer ter você aqui conosco. Antes
                        de tudo, deixa eu me apresentar. Me chamo Wesley
                        Marques, sou cearense, nordestino, apaixonado por forró
                        e fã da Yara Tchê. Sou Pedagogo, Psicólogo (CRP
                        11/23403) e Psicopedagogo Institucional e Clínico.
                        Também sou Especialista em Educação Inclusiva e
                        Mestrando em Educação Inclusiva pelo Instituto Federal
                        de Educação, Ciência e Tecnologia do Ceará (IFCE) .
                      </p>
                      <p>
                        Atuo como professor da rede pública municipal em
                        municípios do estado do Ceará, vivenciando diariamente
                        os desafios e as potências da educação pública e dos
                        contextos escolares inclusivos. <br></br>
                        <br></br>Sou apaixonado pela infância, pela inclusão,
                        pela alfabetização e pelo estudo dos transtornos do
                        neurodesenvolvimento. Acredito profundamente no poder do
                        conhecimento compartilhado, das trocas significativas e
                        da formação de profissionais comprometidos, éticos e
                        sensíveis às singularidades humanas.
                      </p>
                      <p>
                        <strong className="text-primary">
                          Compartilhar saberes,
                        </strong>{" "}
                        aprender com o outro e contribuir com a formação{" "}
                        <strong className="text-primary">
                          de pessoas são partes essenciais da minha trajetória
                          profissional e pessoal.
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
