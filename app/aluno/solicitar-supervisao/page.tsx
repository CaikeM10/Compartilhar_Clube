"use client"

import type React from "react"

import { useState } from "react"
import { MemberLayout } from "@/components/layout/MemberLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ClipboardList, Send, CheckCircle } from "lucide-react"

export default function SolicitarSupervisaoPage() {
  const [formData, setFormData] = useState({
    name: "",
    profession: "",
    caseDescription: "",
    specificQuestions: "",
  })
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log("[v0] Supervisão PP solicitada:", formData)
    setSubmitted(true)
  }

  return (
    <ProtectedRoute>
      <MemberLayout>
        <div className="max-w-3xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">
              Solicitar Supervisão Psicopedagógica
            </h1>
            <p className="text-muted-foreground text-lg">
              Preencha o formulário para solicitar uma supervisão individual ou orientação sobre um caso específico
            </p>
          </div>

          {submitted ? (
            <Card className="p-8 text-center">
              <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-accent" />
              </div>
              <h2 className="text-2xl font-bold text-primary mb-3 font-display">Solicitação enviada!</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Sua solicitação de supervisão foi recebida com sucesso. Entraremos em contato em breve para agendar.
              </p>
              <Button
                onClick={() => setSubmitted(false)}
                className="bg-primary hover:bg-primary/90 text-white rounded-full"
              >
                Enviar nova solicitação
              </Button>
            </Card>
          ) : (
            <Card className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                  <ClipboardList className="w-6 h-6 text-accent" />
                </div>
                <h2 className="text-xl font-semibold text-primary font-display">Formulário de Solicitação</h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                    Seu nome completo *
                  </label>
                  <Input
                    id="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nome completo"
                  />
                </div>

                <div>
                  <label htmlFor="profession" className="block text-sm font-medium text-foreground mb-2">
                    Profissão *
                  </label>
                  <Input
                    id="profession"
                    type="text"
                    required
                    value={formData.profession}
                    onChange={(e) => setFormData({ ...formData, profession: e.target.value })}
                    placeholder="Ex: Psicopedagogo(a), Professor(a), etc."
                  />
                </div>

                <div>
                  <label htmlFor="caseDescription" className="block text-sm font-medium text-foreground mb-2">
                    Descrição do caso *
                  </label>
                  <Textarea
                    id="caseDescription"
                    required
                    value={formData.caseDescription}
                    onChange={(e) => setFormData({ ...formData, caseDescription: e.target.value })}
                    placeholder="Descreva brevemente o caso que gostaria de supervisionar..."
                    rows={6}
                  />
                </div>

                <div>
                  <label htmlFor="specificQuestions" className="block text-sm font-medium text-foreground mb-2">
                    Questões específicas
                  </label>
                  <Textarea
                    id="specificQuestions"
                    value={formData.specificQuestions}
                    onChange={(e) => setFormData({ ...formData, specificQuestions: e.target.value })}
                    placeholder="Há alguma questão ou dúvida específica que gostaria de discutir?"
                    rows={4}
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-accent hover:bg-accent-dark text-primary font-bold rounded-full"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Enviar solicitação
                </Button>
              </form>
            </Card>
          )}

          <Card className="p-6 bg-muted/30">
            <h3 className="font-semibold text-primary mb-2">Como funciona?</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Após o envio, nossa equipe analisará sua solicitação</li>
              <li>• Você receberá um retorno em até 48 horas</li>
              <li>• Agendaremos a supervisão individual conforme disponibilidade</li>
              <li>• A supervisão será realizada online via Zoom</li>
            </ul>
          </Card>
        </div>
      </MemberLayout>
    </ProtectedRoute>
  )
}
