"use client"
import type { ReactNode } from "react"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard,
  Video,
  FileText,
  Users,
  ClipboardList,
  MessageSquare,
  Instagram,
  MessageCircle,
  LogOut,
  Menu,
  X,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

interface MemberLayoutProps {
  children: ReactNode
}

export function MemberLayout({ children }: MemberLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    router.push("/login")
  }

  const navigation = [
    { name: "Dashboard", href: "/aluno/dashboard", icon: LayoutDashboard },
    { name: "Aulas 2026", href: "/aluno/aulas", icon: Video },
    { name: "Recursos PDF", href: "/aluno/recursos", icon: FileText },
    { name: "Supervisões", href: "/aluno/supervisoes", icon: Users },
    { name: "Solicitar Supervisão PP", href: "/aluno/solicitar-supervisao", icon: ClipboardList },
    { name: "Avaliação", href: "/aluno/avaliacao", icon: MessageSquare },
    { name: "Sugestões", href: "/aluno/sugestoes", icon: MessageSquare },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-50 bg-white border-b border-border shadow-sm">
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary">
              <span className="text-lg font-bold text-accent">CC</span>
            </div>
            <span className="font-bold text-primary font-display">Compartilhar Clube</span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 text-primary hover:bg-muted rounded-lg"
          >
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`
        fixed top-0 left-0 z-40 h-full w-72 bg-white border-r border-border
        transform transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-border">
            <Link href="/aluno/dashboard" className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary">
                <span className="text-2xl font-bold text-accent">CC</span>
              </div>
              <div>
                <span className="text-lg font-bold text-primary font-display block">Compartilhar Clube</span>
                <span className="text-xs text-muted-foreground">Área do Aluno</span>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 overflow-y-auto">
            <ul className="space-y-2">
              {navigation.map((item) => {
                const isActive = pathname === item.href
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      onClick={() => setIsSidebarOpen(false)}
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                        ${
                          isActive
                            ? "bg-primary text-white"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }
                      `}
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>

            {/* Social Links */}
            <div className="mt-8 pt-6 border-t border-border">
              <p className="text-sm font-semibold text-muted-foreground mb-3 px-4">Links Rápidos</p>
              <div className="space-y-2">
                <a
                  href="https://instagram.com/compartilharclube"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-2 text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg transition-colors"
                >
                  <Instagram className="w-5 h-5" />
                  <span>Instagram</span>
                </a>
              </div>
            </div>
          </nav>

          {/* User Info & Logout */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-accent/10 rounded-full flex items-center justify-center">
                <span className="text-lg font-semibold text-primary">{user?.name?.charAt(0).toUpperCase() || "U"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:border-destructive bg-transparent"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Main Content */}
      <main className="lg:ml-72 min-h-screen">
        <div className="p-6 lg:p-8">{children}</div>

        {/* Floating WhatsApp Button */}
        <a
          href="https://wa.me/5511999999999"
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 w-14 h-14 bg-[#25D366] hover:bg-[#20BA5A] text-white rounded-full shadow-lg flex items-center justify-center transition-colors z-50"
          title="Grupo do WhatsApp"
        >
          <MessageCircle className="w-6 h-6" />
        </a>
      </main>
    </div>
  )
}
