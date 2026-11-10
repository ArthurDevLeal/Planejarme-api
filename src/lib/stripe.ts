import "dotenv/config";
import Stripe from "stripe";
import { HttpException, ErrorCode } from "../exceptions/root.ts";

let client: Stripe | undefined;

const unavailable = (message: string) => new HttpException(message, ErrorCode.SERVICE_UNAVAILABLE, 503);

/** Cliente do Stripe. Sem chave configurada a cobrança fica indisponível, e o resto da API segue funcionando. */
export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw unavailable("A cobrança ainda não está configurada. Tente novamente mais tarde.");
  // Fora de produção só chave de teste: uma chave live num .env local cobraria cartões de verdade.
  if (process.env.NODE_ENV !== "production" && !key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw unavailable("STRIPE_SECRET_KEY precisa ser uma chave de teste fora de produção.");
  }
  client ??= new Stripe(key);
  return client;
}

/** Confere a assinatura do webhook. Não precisa da chave secreta da API, só do segredo do endpoint. */
export function verifyWebhook(rawBody: Buffer, signature: string | undefined): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw unavailable("Webhook do Stripe não configurado.");
  return Stripe.webhooks.constructEvent(rawBody, signature ?? "", secret);
}
