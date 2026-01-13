"use client"

import { AdminLayout } from "@/components/layout/AdminLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Plus, Edit, Trash2, Eye, EyeOff } from "lucide-react"
import type { Resource } from "@/lib/types"

export default function AdminRecursosPage() {
  const recursos: Resource[] = [
    {
      id: "1",
      title: "Atividades de Alfabetização - Pacote Completo",
      description: "50 atividades prontas para impressão",
      fileUrl: "/recursos/alfabetizacao.pdf",
      fileType: "pdf",
      isActive: true,
      hasAccess: true,
      locked: false,
      createdAt: new Date("2026-01-01"),
    },
    {
      id: "2",
      title: "Jogos Pedagógicos para Desenvolvimento Cognitivo",
      description: "15 jogos com instruções detalhadas",
      fileUrl: "/recursos/jogos.pdf",
      fileType: "pdf",
      isActive: true,
      hasAccess: true,
      locked: false,
      createdAt: new Date("2026-01-05"),
    },
  ]

  return (
    <ProtectedRoute requireAdmin>
      <AdminLayout>
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">Gerenciar Recursos</h1>
              <p className="text-muted-foreground text-lg">Cadastre e organize os recursos em PDF</p>
            </div>
            <Button className="bg-accent hover:bg-accent-dark text-primary font-semibold rounded-full">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Recurso
            </Button>
          </div>

          {/* Recursos Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recursos.map((recurso) => (
              <Card key={recurso.id} className="p-6 flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                    <FileText className="w-6 h-6 text-accent" />
                  </div>
                  {recurso.isActive ? (
                    <span className="inline-flex items-center gap-1 bg-accent/10 px-2 py-1 rounded-full text-xs font-medium text-accent">
                      <Eye className="w-3 h-3" />
                      Ativo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-muted px-2 py-1 rounded-full text-xs font-medium text-muted-foreground">
                      <EyeOff className="w-3 h-3" />
                      Inativo
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-semibold text-primary mb-2 font-display">{recurso.title}</h3>
                <p className="text-sm text-muted-foreground mb-4 flex-1">{recurso.description}</p>

                <div className="text-xs text-muted-foreground mb-4">
                  <span className="uppercase font-semibold">{recurso.fileType}</span> •{" "}
                  {recurso.createdAt.toLocaleDateString("pt-BR")}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 rounded-full bg-transparent">
                    <Edit className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full text-destructive hover:text-destructive border-destructive/30 bg-transparent"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  )
}
