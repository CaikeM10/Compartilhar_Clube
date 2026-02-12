import { NextResponse } from "next/server";
import { MercadoPagoConfig, Preference } from "mercadopago";

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN!,
});

const preference = new Preference(client);

const plans = {
  mensal: {
    title: "Plano Mensal - Compartilhar Clube",
    price: 59,
  },
  trimestral: {
    title: "Plano Trimestral - Compartilhar Clube",
    price: 139,
  },
  anual: {
    title: "Plano Anual - Compartilhar Clube",
    price: 499,
  },
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { plan, email } = body;

    // 🔐 Validação básica
    if (!plan || !plans[plan as keyof typeof plans]) {
      return NextResponse.json({ error: "Plano inválido" }, { status: 400 });
    }

    const selectedPlan = plans[plan as keyof typeof plans];

    // 🚀 Criando preferência de pagamento
    const response = await preference.create({
      body: {
        items: [
          {
            id: plan, // mensal | trimestral | anual
            title: selectedPlan.title,
            quantity: 1,
            currency_id: "BRL",
            unit_price: Number(selectedPlan.price),
          },
        ],

        payer: {
          email: email || undefined,
        },

        // 🔥 ESSENCIAL PARA WEBHOOK
        metadata: {
          plan: plan,
          source: "site",
        },

        back_urls: {
          success: `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/sucesso`,
          failure: `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/erro`,
          pending: `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/pendente`,
        },

        auto_return: "approved",
      },
    });

    return NextResponse.json({
      init_point: response.init_point,
    });
  } catch (error) {
    console.error("Erro ao criar pagamento:", error);

    return NextResponse.json(
      { error: "Erro interno ao criar pagamento" },
      { status: 500 },
    );
  }
}
