"use client"

import { AdminLayout } from "@/components/layout/AdminLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Users, Mail, Shield, User } from "lucide-react"

export default function AdminUsuariosPage() {
  const usuarios = [
    {
      id: "1",
      name: "Maria Silva",
      email: "maria.silva@email.com",
      role: "student" as const,
      createdAt: new Date("2025-12-15"),
    },
    {
      id: "2",
      name: "João Santos",
      email: "joao.santos@email.com",
      role: "student" as const,
      createdAt: new Date("2025-12-20"),
    },
    {
      id: "3",
      name: "Ana Costa",
      email: "ana.costa@email.com",
      role: "admin" as const,
      createdAt: new Date("2025-11-10"),
    },
  ]

  return (
    <ProtectedRoute requireAdmin>
      <AdminLayout>
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">Usuários</h1>
            <p className="text-muted-foreground text-lg">Visualize e gerencie os membros da plataforma</p>
          </div>

          {/* Stats */}
          <Card className="p-6 flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-primary mb-1">{usuarios.length}</p>
              <p className="text-sm text-muted-foreground">Total de usuários cadastrados</p>
            </div>
            <Users className="w-12 h-12 text-primary/20" />
          </Card>

          {/* Users List */}
          <div className="grid gap-4">
            {usuarios.map((usuario) => (
              <Card key={usuario.id} className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-lg font-semibold text-primary">{usuario.name.charAt(0)}</span>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-foreground">{usuario.name}</h3>
                      {usuario.role === "admin" ? (
                        <span className="inline-flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded-full text-xs font-medium text-primary">
                          <Shield className="w-3 h-3" />
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded-full text-xs font-medium text-muted-foreground">
                          <User className="w-3 h-3" />
                          Aluno
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="w-4 h-4" />
                        {usuario.email}
                      </span>
                      <span>Membro desde {usuario.createdAt.toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>

                  <Button variant="outline" size="sm" className="rounded-full bg-transparent">
                    Ver detalhes
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
