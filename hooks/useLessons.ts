"use client"

import { useState, useEffect } from "react"
import { api } from "@/services/api"
import type { Lesson } from "@/lib/types"

export function useLessons() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadLessons()
  }, [])

  const loadLessons = async () => {
    try {
      setIsLoading(true)
      const data = await api.lessons.getAll()
      setLessons(data)
      setError(null)
    } catch (err) {
      setError("Erro ao carregar aulas")
      console.error("[v0] Error loading lessons:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const createLesson = async (lesson: Omit<Lesson, "id">) => {
    try {
      const newLesson = await api.lessons.create(lesson)
      setLessons([...lessons, newLesson])
      return newLesson
    } catch (err) {
      console.error("[v0] Error creating lesson:", err)
      throw err
    }
  }

  const updateLesson = async (id: string, lesson: Partial<Lesson>) => {
    try {
      const updatedLesson = await api.lessons.update(id, lesson)
      setLessons(lessons.map((l) => (l.id === id ? updatedLesson : l)))
      return updatedLesson
    } catch (err) {
      console.error("[v0] Error updating lesson:", err)
      throw err
    }
  }

  const deleteLesson = async (id: string) => {
    try {
      await api.lessons.delete(id)
      setLessons(lessons.filter((l) => l.id !== id))
    } catch (err) {
      console.error("[v0] Error deleting lesson:", err)
      throw err
    }
  }

  return {
    lessons,
    isLoading,
    error,
    createLesson,
    updateLesson,
    deleteLesson,
    reload: loadLessons,
  }
}
