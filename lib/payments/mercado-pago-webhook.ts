import { createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

// Mirrors the unchanged Checkout Pro catalog. Amounts are integer BRL cents.
const PLANS = {
  mensal: { amount: 5900, months: 1 },
  trimestral: { amount: 13900, months: 3 },
  anual: { amount: 49900, months: 12 },
} as const;

type Config = { accessToken?: string; webhookSecret?: string; environment?: string };
type Dependencies = {
  db: Pick<PrismaClient, "$transaction">;
  fetch: typeof fetch;
  config: () => Config;
  now?: () => Date;
};

class WebhookError extends Error {
  status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>) : {};
}

function resourceId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d{0,19}$/.test(value)) return value;
}

function verifyNotification(req: Request, body: Record<string, unknown>, secret: string) {
  const ids = new URL(req.url).searchParams.getAll("data.id");
  const id = ids.length === 1 ? resourceId(ids[0]) : undefined;
  const requestId = req.headers.get("x-request-id");
  const entries = (req.headers.get("x-signature") ?? "").split(",")
    .map((part) => part.trim().split("="));
  const timestamps = entries.filter(([key]) => key === "ts");
  const hashes = entries.filter(([key]) => key === "v1");
  const ts = timestamps[0]?.[1];
  const hash = hashes[0]?.[1];
  if (!id || !requestId || !/^[\w-]{1,200}$/.test(requestId) ||
      timestamps.length !== 1 || hashes.length !== 1 ||
      !ts || !/^\d{1,16}$/.test(ts) || !hash || !/^[a-fA-F0-9]{64}$/.test(hash)) {
    throw new WebhookError(401, "INVALID_SIGNATURE");
  }
  // Mercado Pago manifest uses the query ID, not the untrusted body.
  // No short timestamp cutoff: delayed deliveries are safe through DB idempotency.
  const expected = createHmac("sha256", secret)
    .update(`id:${id};request-id:${requestId};ts:${ts};`).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) {
    throw new WebhookError(401, "INVALID_SIGNATURE");
  }
  if (resourceId(object(body.data).id) !== id) {
    throw new WebhookError(400, "NOTIFICATION_ID_MISMATCH");
  }
  return id;
}

async function getProviderResource(path: string, deps: Dependencies, token: string) {
  try {
    const response = await deps.fetch(`https://api.mercadopago.com${path}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Provider HTTP error");
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid response");
    return object(body);
  } catch {
    throw new WebhookError(502, "PROVIDER_UNAVAILABLE");
  }
}

function approvedPayment(data: Record<string, unknown>, id: string, config: Config) {
  if (resourceId(data.id) !== id || typeof data.status !== "string") {
    throw new WebhookError(502, "INVALID_PROVIDER_PAYMENT");
  }
  if (data.status !== "approved") {
    const known = ["pending", "authorized", "in_process", "in_mediation",
      "rejected", "cancelled", "refunded", "charged_back"];
    if (!known.includes(data.status)) throw new WebhookError(502, "UNKNOWN_PAYMENT_STATUS");
    return null;
  }
  const metadata = object(data.metadata);
  const name = metadata.plan;
  if (typeof name !== "string" || !Object.hasOwn(PLANS, name) || metadata.source !== "site") {
    throw new WebhookError(422, "INVALID_PAYMENT_PLAN");
  }
  const plan = name as keyof typeof PLANS;
  if (data.currency_id !== "BRL") throw new WebhookError(422, "INVALID_PAYMENT_CURRENCY");
  if (typeof data.live_mode !== "boolean" || data.live_mode !== (config.environment === "production")) {
    throw new WebhookError(422, "PAYMENT_ENVIRONMENT_MISMATCH");
  }
  const amount = data.transaction_amount;
  const cents = typeof amount === "number" ? Math.round(amount * 100) : NaN;
  const expectedAmount = config.environment === "development" ? 100 : PLANS[plan].amount;
  if (!Number.isSafeInteger(cents) || typeof amount !== "number" ||
      Math.abs(amount * 100 - cents) > 0.000001 || cents !== expectedAmount) {
    throw new WebhookError(422, "INVALID_PAYMENT_AMOUNT");
  }
  if (data.transaction_amount_refunded !== 0) {
    throw new WebhookError(422, "REFUND_STATE_REQUIRES_REVIEW");
  }
  // No fallback to payer.email: the payer is not necessarily the beneficiary.
  const beneficiaryId = typeof data.external_reference === "string" &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(data.external_reference)
    ? data.external_reference : undefined;
  return { id, plan, cents, months: PLANS[plan].months, beneficiaryId };
}

export function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

async function persistPayment(payment: NonNullable<ReturnType<typeof approvedPayment>>, deps: Dependencies) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await deps.db.$transaction(async (tx) => {
        const existing = await tx.payment.findUnique({ where: { mercadopagoId: payment.id } });
        if (existing) {
          if (existing.plan !== payment.plan || existing.amount !== payment.cents || existing.status !== "approved") {
            throw new WebhookError(409, "EXISTING_PAYMENT_REQUIRES_REVIEW");
          }
          // Historical records are acknowledged, never repaired or granted twice.
          return "duplicate" as const;
        }
        if (!payment.beneficiaryId) throw new WebhookError(422, "BENEFICIARY_REFERENCE_REQUIRED");
        const user = await tx.user.findUnique({ where: { id: payment.beneficiaryId } });
        if (!user) throw new WebhookError(422, "BENEFICIARY_NOT_FOUND");
        const plan = await tx.plan.findUnique({ where: { name: payment.plan } });
        if (!plan) throw new WebhookError(503, "PLAN_NOT_CONFIGURED");
        const now = deps.now?.() ?? new Date();
        const latest = await tx.subscription.findFirst({
          where: { userId: user.id, status: "active", endDate: { gt: now } },
          orderBy: { endDate: "desc" },
        });
        const startDate = latest?.endDate ?? now;
        // Unique payment reservation and entitlement commit or roll back together.
        await tx.payment.create({ data: {
          mercadopagoId: payment.id, email: user.email, plan: payment.plan,
          status: "approved", amount: payment.cents,
        } });
        await tx.subscription.create({ data: {
          userId: user.id, planId: plan.id, status: "active",
          startDate, endDate: addCalendarMonths(startDate, payment.months),
        } });
        return "processed" as const;
      }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    } catch (error) {
      const code = object(error).code;
      // Restart the whole transaction; a unique violation alone is NOT success.
      if (code === "P2034" || code === "P2002") {
        if (attempt < 2) continue;
        throw new WebhookError(503, "TRANSACTION_RETRY_REQUIRED");
      }
      throw error;
    }
  }
  throw new WebhookError(503, "TRANSACTION_RETRY_REQUIRED");
}

export function createWebhookHandler(deps: Dependencies) {
  return async function POST(req: Request): Promise<Response> {
    try {
      const config = deps.config();
      if (!config.webhookSecret || !config.accessToken) throw new WebhookError(503, "WEBHOOK_NOT_CONFIGURED");
      let body: Record<string, unknown>;
      try { body = object(await req.json()); }
      catch { throw new WebhookError(400, "INVALID_JSON"); }
      const id = verifyNotification(req, body, config.webhookSecret);
      const topic = body.type ?? body.topic;
      let ids: string[];
      if (topic === "payment") {
        ids = [id];
      } else if (topic === "merchant_order" || topic === "topic_merchant_order_wh") {
        const order = await getProviderResource(`/merchant_orders/${id}`, deps, config.accessToken);
        if (resourceId(order.id) !== id || !Array.isArray(order.payments)) throw new WebhookError(502, "INVALID_PROVIDER_ORDER");
        const paymentIds = order.payments.map((p: unknown) => resourceId(object(p).id));
        if (paymentIds.some((value) => !value)) throw new WebhookError(502, "INVALID_PROVIDER_ORDER");
        ids = [...new Set(paymentIds as string[])];
      } else {
        return Response.json({ status: "ignored" });
      }
      const results = [];
      for (const paymentId of ids) {
        const data = await getProviderResource(`/v1/payments/${paymentId}`, deps, config.accessToken);
        if (topic !== "payment" && resourceId(object(data.order).id) !== id) throw new WebhookError(422, "PAYMENT_ORDER_MISMATCH");
        const payment = approvedPayment(data, paymentId, config);
        results.push({ paymentId, status: payment ? await persistPayment(payment, deps) : "ignored" });
      }
      return Response.json({ results });
    } catch (error) {
      if (error instanceof WebhookError) return Response.json({ error: error.message }, { status: error.status });
      // Never expose provider payloads, emails, credentials or raw Prisma errors.
      return Response.json({ error: "PERSISTENCE_FAILED" }, { status: 500 });
    }
  };
}
