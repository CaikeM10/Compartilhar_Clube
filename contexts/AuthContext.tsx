"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import type { User } from "@/lib/types"

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check for stored auth token
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem("auth_token")
        if (token) {
          // TODO: Validate token with API
          // For now, mock user data
          const mockUser: User = {
            id: "1",
            name: "Usuário Teste",
            email: "usuario@teste.com",
            role: "student",
            createdAt: new Date(),
          }
          setUser(mockUser)
        }
      } catch (error) {
        console.error("Auth check failed:", error)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  const login = async (email: string, password: string) => {
    try {
      // TODO: Implement actual API call
      // For now, mock login
      const mockUser: User = {
        id: "1",
        name: "Usuário Teste",
        email: email,
        role: email.includes("admin") ? "admin" : "student",
        createdAt: new Date(),
      }

      localStorage.setItem("auth_token", "mock_token_" + Date.now())
      setUser(mockUser)
    } catch (error) {
      throw new Error("Login failed")
    }
  }

  const logout = () => {
    localStorage.removeItem("auth_token")
    setUser(null)
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
