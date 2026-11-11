import { prisma } from "@/lib/prisma";
import { createWebhookHandler } from "@/lib/payments/mercado-pago-webhook";

export const runtime = "nodejs";

export const POST = createWebhookHandler({
  db: prisma,
  fetch: (url, options) => fetch(url, options),
  config: () => ({
    accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
    webhookSecret: process.env.MERCADO_PAGO_WEBHOOK_SECRET,
    environment: process.env.NODE_ENV,
  }),
});
