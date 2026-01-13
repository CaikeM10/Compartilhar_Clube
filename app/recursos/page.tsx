import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { Container } from "@/components/layout/Container"
import { Card } from "@/components/ui/card"
import { FileText, Download, Sparkles } from "lucide-react"

export default function RecursosPage() {
  const recursos = [
    {
      title: "Atividades Práticas",
      description: "Materiais prontos para aplicar com crianças e adolescentes",
      count: "50+",
    },
    {
      title: "Recursos Pedagógicos",
      description: "Ferramentas para professores e educadores",
      count: "30+",
    },
    {
      title: "Materiais Clínicos",
      description: "PDFs para uso em consultório e intervenções",
      count: "40+",
    },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-gradient-to-br from-primary to-secondary py-16 md:py-24">
          <Container>
            <div className="max-w-3xl mx-auto text-center text-white">
              <h1 className="text-4xl md:text-5xl font-bold mb-6 font-display">Recursos do Clube</h1>
              <p className="text-xl text-white/90 leading-relaxed">
                Materiais práticos, criativos e prontos para uso na sua prática profissional
              </p>
            </div>
          </Container>
        </section>

        {/* Recursos Overview */}
        <section className="py-16">
          <Container>
            <div className="grid md:grid-cols-3 gap-8 mb-16">
              {recursos.map((recurso, index) => (
                <Card key={index} className="p-8 text-center hover:shadow-lg transition-shadow">
                  <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-accent" />
                  </div>
                  <div className="text-3xl font-bold text-primary mb-2">{recurso.count}</div>
                  <h3 className="text-xl font-semibold text-primary mb-2 font-display">{recurso.title}</h3>
                  <p className="text-muted-foreground">{recurso.description}</p>
                </Card>
              ))}
            </div>

            <div className="max-w-3xl mx-auto">
              <Card className="p-8 md:p-12 bg-muted/30 border-2">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-3 font-display">
                      Recursos exclusivos para membros
                    </h3>
                    <p className="text-muted-foreground leading-relaxed mb-4">
                      Todos os recursos do Compartilhar Clube estão disponíveis em formato PDF, prontos para impressão e
                      uso imediato. Você terá acesso a:
                    </p>
                  </div>
                </div>

                <ul className="space-y-3 mb-6">
                  <li className="flex items-center gap-3 text-muted-foreground">
                    <Download className="w-5 h-5 text-primary flex-shrink-0" />
                    <span>Atividades práticas para diferentes faixas etárias</span>
                  </li>
                  <li className="flex items-center gap-3 text-muted-foreground">
                    <Download className="w-5 h-5 text-primary flex-shrink-0" />
                    <span>Materiais de apoio pedagógico e clínico</span>
                  </li>
                  <li className="flex items-center gap-3 text-muted-foreground">
                    <Download className="w-5 h-5 text-primary flex-shrink-0" />
                    <span>Recursos visuais e interativos</span>
                  </li>
                  <li className="flex items-center gap-3 text-muted-foreground">
                    <Download className="w-5 h-5 text-primary flex-shrink-0" />
                    <span>Novos materiais adicionados regularmente</span>
                  </li>
                </ul>

                <p className="text-sm text-muted-foreground italic">
                  Faça parte do clube para ter acesso completo a todos os recursos disponíveis!
                </p>
              </Card>
            </div>
          </Container>
        </section>
      </main>

      <Footer />
    </div>
  )
}
