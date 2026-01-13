"use client"

import { useState, useEffect } from "react"
import { api } from "@/services/api"
import type { Resource } from "@/lib/types"

export function useResources() {
  const [resources, setResources] = useState<Resource[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadResources()
  }, [])

  const loadResources = async () => {
    try {
      setIsLoading(true)
      const data = await api.resources.getAll()
      setResources(data)
      setError(null)
    } catch (err) {
      setError("Erro ao carregar recursos")
      console.error("[v0] Error loading resources:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const createResource = async (resource: Omit<Resource, "id" | "createdAt">) => {
    try {
      const newResource = await api.resources.create(resource)
      setResources([...resources, newResource])
      return newResource
    } catch (err) {
      console.error("[v0] Error creating resource:", err)
      throw err
    }
  }

  const updateResource = async (id: string, resource: Partial<Resource>) => {
    try {
      const updatedResource = await api.resources.update(id, resource)
      setResources(resources.map((r) => (r.id === id ? updatedResource : r)))
      return updatedResource
    } catch (err) {
      console.error("[v0] Error updating resource:", err)
      throw err
    }
  }

  const deleteResource = async (id: string) => {
    try {
      await api.resources.delete(id)
      setResources(resources.filter((r) => r.id !== id))
    } catch (err) {
      console.error("[v0] Error deleting resource:", err)
      throw err
    }
  }

  return {
    resources,
    isLoading,
    error,
    createResource,
    updateResource,
    deleteResource,
    reload: loadResources,
  }
}
