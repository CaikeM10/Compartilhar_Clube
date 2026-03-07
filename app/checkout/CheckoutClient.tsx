"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/button";
import { ShieldCheck, CreditCard, QrCode } from "lucide-react";

export default function CheckoutClient() {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan");

  const [loading, setLoading] = useState(false);

  const plans = {
    mensal: {
      title: "Plano Mensal",
      price: "R$ 59,00",
      period: "Acesso por 1 mês",
      highlight: null,
    },
    trimestral: {
      title: "Plano Trimestral",
      price: "R$ 139,00",
      period: "Acesso por 3 meses",
      highlight: "Equivalente a R$ 49,90/mês",
    },
    anual: {
      title: "Plano Anual",
      price: "R$ 499,00",
      period: "Acesso por 12 meses",
      highlight: "Equivalente a R$ 39,90/mês",
    },
  };

  const selectedPlan = plans[plan as keyof typeof plans];

  if (!selectedPlan) {
    return (
      <Container className="py-32 text-center">
        <p className="text-muted-foreground text-lg">Plano não encontrado.</p>
      </Container>
    );
  }

  async function handlePayment() {
    try {
      setLoading(true);

      const response = await fetch("/api/create-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan,
        }),
      });

      const data = await response.json();

      if (!data.init_point) {
        throw new Error("Erro ao gerar checkout");
      }

      // redirecionamento seguro para mobile
      window.location.href = data.init_point;
    } catch (error) {
      console.error(error);
      alert("Erro ao iniciar pagamento");
      setLoading(false);
    }
  }

  return (
    <Container className="py-24">
      <div className="max-w-lg mx-auto">
        <div className="bg-white border border-border/60 rounded-3xl shadow-xl p-10 space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-primary font-display">
              {selectedPlan.title}
            </h1>

            <p className="text-muted-foreground">{selectedPlan.period}</p>

            {selectedPlan.highlight && (
              <span className="inline-block mt-2 px-4 py-1 rounded-full bg-accent/15 text-accent font-semibold text-sm">
                {selectedPlan.highlight}
              </span>
            )}
          </div>

          {/* Preço */}
          <div className="text-center">
            <p className="text-4xl font-bold text-primary">
              {selectedPlan.price}
            </p>

            <p className="text-sm text-muted-foreground mt-1">
              Pagamento único
            </p>
          </div>

          {/* Métodos */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <CreditCard className="w-4 h-4 text-accent" />
              Cartão de crédito (até 12x)
            </div>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <QrCode className="w-4 h-4 text-accent" />
              PIX (liberação imediata)
            </div>
          </div>

          {/* Botão pagamento */}
          <Button
            onClick={handlePayment}
            disabled={loading}
            className="w-full bg-gradient-to-r from-accent to-[#f3c969] hover:brightness-110 text-primary font-bold py-6 rounded-full shadow-lg text-lg"
          >
            {loading ? "Redirecionando..." : "Pagar agora"}
          </Button>

          {/* Segurança */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="w-4 h-4 text-accent" />
            Pagamento 100% seguro • Acesso liberado após confirmação
          </div>
        </div>
      </div>
    </Container>
  );
}
