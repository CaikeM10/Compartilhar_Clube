"use client"

import type React from "react"

import { useState } from "react"
import { MemberLayout } from "@/components/layout/MemberLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Lightbulb, Send, CheckCircle } from "lucide-react"

export default function SugestoesPage() {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
  })
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log("[v0] Sugestão enviada:", formData)
    setSubmitted(true)
  }

  return (
    <ProtectedRoute>
      <MemberLayout>
        <div className="max-w-3xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">Formulário de Sugestões</h1>
            <p className="text-muted-foreground text-lg">
              Compartilhe suas ideias para melhorarmos juntos o Compartilhar Clube
            </p>
          </div>

          {submitted ? (
            <Card className="p-8 text-center">
              <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-accent" />
              </div>
              <h2 className="text-2xl font-bold text-primary mb-3 font-display">Sugestão recebida!</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Obrigado por compartilhar sua ideia! Valorizamos muito sua contribuição e analisaremos sua sugestão com
                carinho.
              </p>
              <Button
                onClick={() => setSubmitted(false)}
                className="bg-primary hover:bg-primary/90 text-white rounded-full"
              >
                Enviar nova sugestão
              </Button>
            </Card>
          ) : (
            <Card className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                  <Lightbulb className="w-6 h-6 text-accent" />
                </div>
                <h2 className="text-xl font-semibold text-primary font-display">Compartilhe sua ideia</h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-foreground mb-2">
                    Título da sugestão *
                  </label>
                  <Input
                    id="title"
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Ex: Adicionar mais aulas sobre..."
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-foreground mb-2">
                    Descrição detalhada *
                  </label>
                  <Textarea
                    id="description"
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descreva sua sugestão em detalhes. Como isso melhoraria o clube?"
                    rows={8}
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-accent hover:bg-accent-dark text-primary font-bold rounded-full"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Enviar sugestão
                </Button>
              </form>
            </Card>
          )}

          <Card className="p-6 bg-muted/30">
            <h3 className="font-semibold text-primary mb-2">Tipos de sugestões que adoramos receber:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Temas para novas aulas e formações</li>
              <li>• Tipos de recursos e materiais que você gostaria de ter</li>
              <li>• Melhorias na plataforma ou na organização do conteúdo</li>
              <li>• Novas funcionalidades ou serviços</li>
              <li>• Ideias para eventos e encontros da comunidade</li>
            </ul>
          </Card>
        </div>
      </MemberLayout>
    </ProtectedRoute>
  )
}
