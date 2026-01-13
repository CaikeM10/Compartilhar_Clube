"use client"

import type React from "react"

import { useScrollAnimation } from "@/hooks/useScrollAnimation"

interface ScrollAnimationProps {
  children: React.ReactNode
  animation?: "fade-up" | "fade-down" | "fade-left" | "fade-right" | "scale" | "fade-in"
  delay?: number
  className?: string
}

export function ScrollAnimation({ children, animation = "fade-up", delay = 0, className = "" }: ScrollAnimationProps) {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1 })

  const delayClass = delay > 0 ? `delay-${delay}` : ""
  const animationClass = `scroll-${animation}`

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`${animationClass} ${isVisible ? "is-visible" : ""} ${delayClass} ${className}`}
    >
      {children}
    </div>
  )
}
