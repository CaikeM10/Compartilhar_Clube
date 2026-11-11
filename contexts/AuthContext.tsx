"use client"

import { createContext, useContext, useState, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react"
import type { User } from "@/lib/types"
import { sessionClient } from "@/lib/auth/client"
import { createSessionStore } from "@/lib/auth/session-store"
import { useRouter } from "next/navigation"

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<"/admin/dashboard" | "/aluno/dashboard">
  logout: () => Promise<void>
  isAuthenticated: boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createSessionStore(sessionClient))
  const { user, isLoading } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
  const channel = useRef<BroadcastChannel | null>(null)
  const previousUser = useRef<User | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    const previous = previousUser.current
    previousUser.current = user
    if (previous && (previous.id !== user?.id || previous.role !== user?.role)) {
      // Re-run the existing server guards after revocation or a role change.
      router.refresh()
    }
  }, [user, isLoading, router])

  useEffect(() => {
    // One-way cleanup of the obsolete mock marker; never read/store a session token.
    try { localStorage.removeItem("auth_token") } catch { /* Storage may be unavailable. */ }
    void store.refresh()
    const refresh = () => { if (document.visibilityState === "visible") void store.refresh() }
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    const timer = window.setInterval(refresh, 60_000)
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("compartilhar-session")
      channel.current.onmessage = () => { void store.refresh() }
    }
    return () => {
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
      window.clearInterval(timer)
      channel.current?.close()
      channel.current = null
    }
  }, [store])

  const login = async (email: string, password: string) => {
    const destination = await store.login(email, password)
    channel.current?.postMessage("changed")
    return destination
  }

  const logout = async () => {
    await store.logout()
    channel.current?.postMessage("changed")
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
