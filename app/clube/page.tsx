import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { Container } from "@/components/layout/Container"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Check, Sparkles } from "lucide-react"
import Link from "next/link"

export default function ClubePage() {
  const benefits = [
    "Aulas gravadas semanais e/ou quinzenais",
    "Acesso a todos os recursos em PDF",
    "Supervisões de caso em grupo",
    "Possibilidade de supervisão individual (PP)",
    "Comunidade exclusiva no WhatsApp",
    "Networking com profissionais da área",
    "Certificados de participação",
    "Suporte contínuo da equipe",
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-gradient-to-br from-primary via-primary to-secondary py-16 md:py-24">
          <Container>
            <div className="max-w-3xl mx-auto text-center text-white">
              <div className="inline-flex items-center gap-2 bg-accent/20 px-4 py-2 rounded-full mb-6">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-accent font-semibold">Comunidade de Aprendizagem</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-6 font-display">Clube de Assinatura</h1>
              <p className="text-xl text-white/90 leading-relaxed">
                Formação continuada, recursos práticos e uma comunidade que te apoia no dia a dia profissional
              </p>
            </div>
          </Container>
        </section>

        {/* Benefits */}
        <section className="py-16">
          <Container>
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4 font-display">
                  O que está incluído na assinatura
                </h2>
                <p className="text-lg text-muted-foreground">Tudo que você precisa para crescer profissionalmente</p>
              </div>

              <Card className="p-8 md:p-12 border-2">
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  {benefits.map((benefit, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-accent/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="w-4 h-4 text-accent" />
                      </div>
                      <span className="text-foreground leading-relaxed">{benefit}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-muted/30 rounded-lg p-6 mb-8">
                  <h3 className="text-xl font-semibold text-primary mb-3 font-display">
                    Investimento mensal acessível
                  </h3>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    Por um valor simbólico mensal, você tem acesso a todo o conteúdo, recursos e suporte da comunidade.
                    Entre em contato para conhecer as opções de assinatura.
                  </p>
                  <p className="text-sm text-muted-foreground italic">* Condições especiais para estudantes e grupos</p>
                </div>

                <div className="text-center">
                  <Button
                    asChild
                    size="lg"
                    className="bg-accent hover:bg-accent-dark text-primary font-bold text-lg px-8 py-6 rounded-full"
                  >
                    <Link href="/contato">Quero assinar o clube</Link>
                  </Button>
                </div>
              </Card>
            </div>
          </Container>
        </section>

        {/* Testimonial Section */}
        <section className="py-16 bg-muted/30">
          <Container>
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl font-bold text-primary mb-8 font-display">
                Faça parte de uma comunidade que te acolhe
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed mb-8">
                No Compartilhar Clube, você não está sozinho(a). Aqui, profissionais como você se encontram para
                compartilhar experiências, aprender juntos e crescer de forma contínua.
              </p>
              <Button
                asChild
                size="lg"
                className="bg-primary hover:bg-primary/90 text-white font-semibold px-8 rounded-full"
              >
                <Link href="/contato">Entre em contato</Link>
              </Button>
            </div>
          </Container>
        </section>
      </main>

      <Footer />
    </div>
  )
}
