import { NextResponse } from "next/server";
import { MercadoPagoConfig, Preference } from "mercadopago";

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN!,
});

const preference = new Preference(client);

// 📦 PLANOS
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

    // 🔒 valida plano
    if (!plan || !plans[plan as keyof typeof plans]) {
      return NextResponse.json({ error: "Plano inválido" }, { status: 400 });
    }

    const selectedPlan = plans[plan as keyof typeof plans];

    // 🔥 DETECTA AMBIENTE
    const isDev = process.env.NODE_ENV === "development";

    // 🔥 BASE URL DINÂMICA
    const baseUrl = isDev
      ? "https://keven-seizable-doria.ngrok-free.dev" // 👈 TROCA PELO SEU NGROK
      : process.env.NEXT_PUBLIC_BASE_URL;

    // 🔥 VALOR DINÂMICO (TESTE = R$1)
    const price = isDev ? 1 : Number(selectedPlan.price);

    console.log("🌐 Ambiente:", isDev ? "DEV" : "PROD");
    console.log("💰 Valor:", price);
    console.log("🔗 Base URL:", baseUrl);

    const response = await preference.create({
      body: {
        items: [
          {
            id: plan,
            title: selectedPlan.title,
            quantity: 1,
            currency_id: "BRL",
            unit_price: price,
          },
        ],

        payer: {
          email: email || undefined,
        },

        metadata: {
          plan: plan,
          source: "site",
        },

        back_urls: {
          success: `${baseUrl}/checkout/sucesso`,
          failure: `${baseUrl}/checkout/erro`,
          pending: `${baseUrl}/checkout/pendente`,
        },

        // 🔥 WEBHOOK (ESSENCIAL)
        notification_url: `${baseUrl}/api/webhook`,

        payment_methods: {
          installments: 12,
          default_installments: 1,
        },

        auto_return: "approved",
      },
    });

    return NextResponse.json({
      init_point: response.init_point,
    });
  } catch (error) {
    console.error("❌ Erro ao criar pagamento:", error);

    return NextResponse.json(
      { error: "Erro ao criar pagamento" },
      { status: 500 },
    );
  }
}
