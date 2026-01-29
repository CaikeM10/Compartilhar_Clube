"use client";

import { useSearchParams } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, CreditCard, QrCode, CalendarClock } from "lucide-react";

const PLANS = {
  mensal: {
    name: "Plano Mensal",
    price: "R$ 59,00",
    monthly: null,
    period: "Acesso por 1 mês",
    installments: "Pagamento único",
  },
  trimestral: {
    name: "Plano Trimestral",
    price: "R$ 139,00",
    monthly: "R$ 49,90/mês",
    period: "Acesso por 3 meses",
    installments: "Até 3x no cartão",
  },
  anual: {
    name: "Plano Anual",
    price: "R$ 499,00",
    monthly: "R$ 39,90/mês",
    period: "Acesso por 12 meses",
    installments: "Até 12x no cartão",
  },
};

export default function CheckoutPage() {
  const params = useSearchParams();
  const planKey = params.get("plan") as keyof typeof PLANS;
  const plan = PLANS[planKey];

  if (!plan) {
    return (
      <Container className="py-24 text-center">
        <p className="text-lg text-muted-foreground">
          Plano inválido. Volte e selecione um plano.
        </p>
      </Container>
    );
  }

  return (
    <Container className="py-24">
      <div className="max-w-xl mx-auto">
        <Card className="p-10 shadow-xl border border-border/60">
          <h1 className="text-3xl font-bold text-primary mb-2 font-display text-center">
            Finalizar assinatura
          </h1>

          <p className="text-muted-foreground text-center mb-8">
            Revise os detalhes do plano antes de continuar
          </p>

          {/* RESUMO DO PLANO */}
          <div className="bg-muted/30 rounded-xl p-6 mb-8 space-y-3">
            <h2 className="text-xl font-semibold text-primary">{plan.name}</h2>

            <div className="text-3xl font-bold text-primary">{plan.price}</div>

            {plan.monthly && (
              <p className="text-sm text-muted-foreground">({plan.monthly})</p>
            )}

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="w-4 h-4 text-accent" />
              {plan.period}
            </div>

            <p className="text-sm text-muted-foreground">{plan.installments}</p>
          </div>

          {/* MÉTODOS DE PAGAMENTO */}
          <div className="mb-8 space-y-3">
            <p className="text-sm font-semibold text-primary">
              Formas de pagamento
            </p>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <QrCode className="w-5 h-5 text-accent" />
              PIX (aprovação imediata)
            </div>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <CreditCard className="w-5 h-5 text-accent" />
              Cartão de crédito ({plan.installments})
            </div>
          </div>

          {/* SEGURANÇA */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8">
            <ShieldCheck className="w-5 h-5 text-accent" />
            Pagamento seguro • Ambiente protegido
          </div>

          {/* CTA */}
          <Button
            size="lg"
            className="w-full bg-gradient-to-r from-accent to-[#f3c969] hover:brightness-110 text-primary font-bold py-6 rounded-full"
          >
            Pagar agora
          </Button>

          <p className="text-xs text-muted-foreground text-center mt-4">
            Você será redirecionado para concluir o pagamento com segurança.
          </p>
        </Card>
      </div>
    </Container>
  );
}
