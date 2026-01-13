import { AdminLayout } from "@/components/layout/AdminLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Settings, Save } from "lucide-react"

export default function AdminConfiguracoesPage() {
  return (
    <ProtectedRoute requireAdmin>
      <AdminLayout>
        <div className="max-w-4xl space-y-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">Configurações</h1>
            <p className="text-muted-foreground text-lg">Gerencie as configurações gerais da plataforma</p>
          </div>

          {/* Site Settings */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Settings className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-primary font-display">Informações do Site</h2>
            </div>

            <form className="space-y-6">
              <div>
                <label htmlFor="siteName" className="block text-sm font-medium text-foreground mb-2">
                  Nome da Plataforma
                </label>
                <Input id="siteName" type="text" defaultValue="Compartilhar Clube" />
              </div>

              <div>
                <label htmlFor="siteDescription" className="block text-sm font-medium text-foreground mb-2">
                  Descrição
                </label>
                <Textarea
                  id="siteDescription"
                  defaultValue="Comunidade de aprendizagem e formação continuada para profissionais da educação"
                  rows={3}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                    E-mail de Contato
                  </label>
                  <Input id="email" type="email" defaultValue="contato@compartilharclube.com.br" />
                </div>

                <div>
                  <label htmlFor="whatsapp" className="block text-sm font-medium text-foreground mb-2">
                    WhatsApp
                  </label>
                  <Input id="whatsapp" type="tel" defaultValue="(11) 99999-9999" />
                </div>
              </div>

              <div>
                <label htmlFor="instagram" className="block text-sm font-medium text-foreground mb-2">
                  Instagram
                </label>
                <Input id="instagram" type="text" defaultValue="@compartilharclube" />
              </div>

              <Button className="bg-accent hover:bg-accent-dark text-primary font-semibold rounded-full">
                <Save className="w-4 h-4 mr-2" />
                Salvar Alterações
              </Button>
            </form>
          </Card>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  )
}
