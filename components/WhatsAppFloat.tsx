"use client"

import { useState, useEffect } from "react"
import { MessageCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export function WhatsAppFloat() {
  const [isVisible, setIsVisible] = useState(false)
  const [showBubble, setShowBubble] = useState(true)

  // Show button after scrolling down
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setIsVisible(true)
      } else {
        setIsVisible(false)
      }
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Auto-hide bubble after 5 seconds
  useEffect(() => {
    if (isVisible && showBubble) {
      const timer = setTimeout(() => {
        setShowBubble(false)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [isVisible, showBubble])

  const handleWhatsAppClick = () => {
    // Replace with actual WhatsApp number
    const phoneNumber = "5511999999999" // Format: country code + number
    const message = encodeURIComponent("Olá! Gostaria de saber mais sobre o Compartilhar Clube.")
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, "_blank")
  }

  if (!isVisible) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Message Bubble */}
      {showBubble && (
        <div className="relative bg-white rounded-2xl shadow-lg p-4 max-w-xs animate-in slide-in-from-right">
          <button
            onClick={() => setShowBubble(false)}
            className="absolute -top-2 -right-2 w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center transition-colors"
            aria-label="Fechar mensagem"
          >
            <X className="w-3 h-3 text-gray-600" />
          </button>
          <p className="text-sm text-gray-700 leading-relaxed">
            <strong className="text-primary">Olá!</strong> 👋<br />
            Tem alguma dúvida? Estou aqui para ajudar!
          </p>
          <div className="absolute bottom-0 right-6 w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-white" />
        </div>
      )}

      {/* WhatsApp Button */}
      <Button
        onClick={handleWhatsAppClick}
        size="lg"
        className="w-16 h-16 rounded-full bg-[#25D366] hover:bg-[#20bd5a] shadow-lg hover:shadow-xl transition-all group"
        aria-label="Abrir WhatsApp"
      >
        <MessageCircle className="w-8 h-8 text-white group-hover:scale-110 transition-transform" />
      </Button>
    </div>
  )
}
