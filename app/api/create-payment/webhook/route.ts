import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MercadoPagoConfig, Payment } from "mercadopago";

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN!,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.type !== "payment") {
      return NextResponse.json({ received: true });
    }

    const paymentId = body.data.id;

    const payment = await new Payment(client).get({
      id: paymentId,
    });

    if (payment.status !== "approved") {
      return NextResponse.json({ received: true });
    }

    // Aqui vamos ativar assinatura
    const userEmail = payment.payer?.email;

    if (!userEmail) {
      return NextResponse.json({ received: true });
    }

    const user = await prisma.user.findUnique({
      where: { email: userEmail },
    });

    if (!user) {
      return NextResponse.json({ received: true });
    }

    // Aqui você pode buscar o plano via metadata
    const planName = payment.metadata?.plan;

    const plan = await prisma.plan.findFirst({
      where: { name: planName },
    });

    if (!plan) {
      return NextResponse.json({ received: true });
    }

    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        status: "active",
        startDate: new Date(),
        endDate: new Date(
          new Date().setMonth(new Date().getMonth() + plan.duration),
        ),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: true }, { status: 500 });
  }
}
