// Mock API service - Replace with real API calls when backend is ready

import type { User, Lesson, Resource } from "@/lib/types"

// Mock delay to simulate API calls
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const api = {
  // Auth
  auth: {
    login: async (email: string, password: string): Promise<User> => {
      await delay(500)
      // Mock login - replace with real API call
      return {
        id: "1",
        name: "Usuário Teste",
        email: email,
        role: email.includes("admin") ? "admin" : "student",
        createdAt: new Date(),
      }
    },

    register: async (name: string, email: string, password: string): Promise<User> => {
      await delay(500)
      return {
        id: Date.now().toString(),
        name,
        email,
        role: "student",
        createdAt: new Date(),
      }
    },

    getCurrentUser: async (): Promise<User | null> => {
      await delay(300)
      const token = localStorage.getItem("auth_token")
      if (!token) return null

      // Mock user - replace with real API call
      return {
        id: "1",
        name: "Usuário Teste",
        email: "usuario@teste.com",
        role: "student",
        createdAt: new Date(),
      }
    },
  },

  // Lessons
  lessons: {
    getAll: async (): Promise<Lesson[]> => {
      await delay(500)
      // Mock data - replace with real API call
      return [
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
      ]
    },

    getById: async (id: string): Promise<Lesson | null> => {
      await delay(300)
      return null
    },

    create: async (lesson: Omit<Lesson, "id">): Promise<Lesson> => {
      await delay(500)
      return {
        ...lesson,
        id: Date.now().toString(),
      }
    },

    update: async (id: string, lesson: Partial<Lesson>): Promise<Lesson> => {
      await delay(500)
      return lesson as Lesson
    },

    delete: async (id: string): Promise<void> => {
      await delay(500)
    },
  },

  // Resources
  resources: {
    getAll: async (): Promise<Resource[]> => {
      await delay(500)
      return []
    },

    getById: async (id: string): Promise<Resource | null> => {
      await delay(300)
      return null
    },

    create: async (resource: Omit<Resource, "id" | "createdAt">): Promise<Resource> => {
      await delay(500)
      return {
        ...resource,
        id: Date.now().toString(),
        createdAt: new Date(),
      }
    },

    update: async (id: string, resource: Partial<Resource>): Promise<Resource> => {
      await delay(500)
      return resource as Resource
    },

    delete: async (id: string): Promise<void> => {
      await delay(500)
    },
  },

  // Users
  users: {
    getAll: async (): Promise<User[]> => {
      await delay(500)
      return []
    },

    getById: async (id: string): Promise<User | null> => {
      await delay(300)
      return null
    },

    update: async (id: string, user: Partial<User>): Promise<User> => {
      await delay(500)
      return user as User
    },

    delete: async (id: string): Promise<void> => {
      await delay(500)
    },
  },

  // Feedback
  feedback: {
    submitEvaluation: async (data: { rating: number; feedback: string }): Promise<void> => {
      await delay(500)
      console.log("[API] Evaluation submitted:", data)
    },

    submitSuggestion: async (data: { title: string; description: string }): Promise<void> => {
      await delay(500)
      console.log("[API] Suggestion submitted:", data)
    },

    requestSupervision: async (data: {
      name: string
      profession: string
      caseDescription: string
      specificQuestions?: string
    }): Promise<void> => {
      await delay(500)
      console.log("[API] Supervision requested:", data)
    },

    submitContactForm: async (data: {
      name: string
      email: string
      phone?: string
      message: string
    }): Promise<void> => {
      await delay(500)
      console.log("[API] Contact form submitted:", data)
    },
  },
}
