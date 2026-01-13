export interface User {
  id: string
  name: string
  email: string
  role: "admin" | "student"
  createdAt: Date
}

export interface Course {
  id: string
  title: string
  description: string
  thumbnail?: string
  isActive: boolean
  createdAt: Date
}

export interface Lesson {
  id: string
  courseId: string
  title: string
  description: string
  videoUrl?: string
  duration?: number
  order: number
  isActive: boolean
  hasAccess: boolean
  locked: boolean
}

export interface Resource {
  id: string
  title: string
  description: string
  fileUrl: string
  fileType: "pdf" | "image" | "other"
  isActive: boolean
  hasAccess: boolean
  locked: boolean
  createdAt: Date
}

export interface Supervision {
  id: string
  title: string
  description: string
  date: Date
  type: "group" | "individual"
  profession?: "psychologist" | "psychopedagogue" | "teacher" | "other"
  isActive: boolean
}
