"use client"

import { AdminLayout } from "@/components/layout/AdminLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Video, Plus, Edit, Trash2, Eye, EyeOff } from "lucide-react"
import type { Lesson } from "@/lib/types"

export default function AdminAulasPage() {
  const aulas: Lesson[] = [
    {
      id: "1",
      courseId: "2026",
      title: "Introdução ao Compartilhar Clube",
      description: "Conheça a plataforma e como aproveitar ao máximo",
      duration: 15,
      order: 1,
      isActive: true,
      hasAccess: true,
      locked: false,
    },
    {
      id: "2",
      courseId: "2026",
      title: "Desenvolvimento Cognitivo na Primeira Infância",
      description: "Principais marcos e como estimular o desenvolvimento",
      duration: 45,
      order: 2,
      isActive: true,
      hasAccess: true,
      locked: false,
    },
  ]

  return (
    <ProtectedRoute requireAdmin>
      <AdminLayout>
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">Gerenciar Aulas</h1>
              <p className="text-muted-foreground text-lg">Cadastre e organize as aulas da plataforma</p>
            </div>
            <Button className="bg-accent hover:bg-accent-dark text-primary font-semibold rounded-full">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Aula
            </Button>
          </div>

          {/* Aulas List */}
          <div className="grid gap-4">
            {aulas.map((aula) => (
              <Card key={aula.id} className="p-6">
                <div className="flex flex-col lg:flex-row gap-6">
                  <div className="w-full lg:w-48 h-32 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                    <Video className="w-12 h-12 text-white/80" />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-lg font-semibold text-primary mb-1 font-display">{aula.title}</h3>
                        <p className="text-sm text-muted-foreground">{aula.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {aula.isActive ? (
                          <span className="inline-flex items-center gap-1 bg-accent/10 px-3 py-1 rounded-full text-xs font-medium text-accent">
                            <Eye className="w-3 h-3" />
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-muted px-3 py-1 rounded-full text-xs font-medium text-muted-foreground">
                            <EyeOff className="w-3 h-3" />
                            Inativo
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                      <span>Duração: {aula.duration} min</span>
                      <span>Ordem: {aula.order}</span>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="rounded-full bg-transparent">
                        <Edit className="w-4 h-4 mr-2" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full text-destructive hover:text-destructive border-destructive/30 bg-transparent"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  )
}
