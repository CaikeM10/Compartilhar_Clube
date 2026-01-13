"use client"

import type React from "react"

import { useState } from "react"
import { MemberLayout } from "@/components/layout/MemberLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MessageSquare, Send, CheckCircle, Star } from "lucide-react"

export default function AvaliacaoPage() {
  const [formData, setFormData] = useState({
    rating: 0,
    feedback: "",
  })
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log("[v0] Avaliação enviada:", formData)
    setSubmitted(true)
  }

  return (
    <ProtectedRoute>
      <MemberLayout>
        <div className="max-w-3xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">Formulário de Avaliação</h1>
            <p className="text-muted-foreground text-lg">
              Sua opinião é muito importante para melhorarmos o Compartilhar Clube
            </p>
          </div>

          {submitted ? (
            <Card className="p-8 text-center">
              <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-accent" />
              </div>
              <h2 className="text-2xl font-bold text-primary mb-3 font-display">Obrigado pelo feedback!</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Sua avaliação foi enviada com sucesso. Valorizamos muito sua opinião e utilizaremos seu feedback para
                melhorar continuamente.
              </p>
              <Button
                onClick={() => setSubmitted(false)}
                className="bg-primary hover:bg-primary/90 text-white rounded-full"
              >
                Enviar nova avaliação
              </Button>
            </Card>
          ) : (
            <Card className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-accent" />
                </div>
                <h2 className="text-xl font-semibold text-primary font-display">Avalie sua experiência</h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">
                    Como você avalia o Compartilhar Clube? *
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setFormData({ ...formData, rating: star })}
                        className="transition-transform hover:scale-110"
                      >
                        <Star
                          className={`w-10 h-10 ${
                            star <= formData.rating ? "fill-accent text-accent" : "text-muted-foreground"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {formData.rating === 0 && "Selecione uma avaliação"}
                    {formData.rating === 1 && "Muito insatisfeito"}
                    {formData.rating === 2 && "Insatisfeito"}
                    {formData.rating === 3 && "Neutro"}
                    {formData.rating === 4 && "Satisfeito"}
                    {formData.rating === 5 && "Muito satisfeito"}
                  </p>
                </div>

                <div>
                  <label htmlFor="feedback" className="block text-sm font-medium text-foreground mb-2">
                    Conte-nos mais sobre sua experiência *
                  </label>
                  <Textarea
                    id="feedback"
                    required
                    value={formData.feedback}
                    onChange={(e) => setFormData({ ...formData, feedback: e.target.value })}
                    placeholder="O que você achou do clube? O que podemos melhorar?"
                    rows={8}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={formData.rating === 0}
                  size="lg"
                  className="w-full bg-accent hover:bg-accent-dark text-primary font-bold rounded-full"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Enviar avaliação
                </Button>
              </form>
            </Card>
          )}
        </div>
      </MemberLayout>
    </ProtectedRoute>
  )
}
