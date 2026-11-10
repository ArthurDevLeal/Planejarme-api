import "dotenv/config";
import crypto from "node:crypto";
import { HttpException, ErrorCode } from "../exceptions/root.ts";

const BASE_URL = "https://api.abacatepay.com/v2";
// Chave pública da Abacate Pay, a mesma para todas as lojas (docs: /pages/webhooks/security). Não é segredo.
const WEBHOOK_HMAC_KEY =
  "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";

const unavailable = (message: string) => new HttpException(message, ErrorCode.SERVICE_UNAVAILABLE, 503);

function apiKey() {
  const key = process.env.ABACATEPAY_API_KEY;
  if (!key) throw unavailable("A cobrança ainda não está configurada. Tente novamente mais tarde.");
  // Fora de produção só chave de Dev mode: uma chave de produção num .env local cobraria de verdade.
  if (process.env.NODE_ENV !== "production" && !key.startsWith("abc_dev_")) {
    throw unavailable("ABACATEPAY_API_KEY precisa ser uma chave de Dev mode (abc_dev_...) fora de produção.");
  }
  return key;
}

/** Falha vinda da Abacate Pay. `providerMessage` é o texto dela, só para log e decisões internas; a pessoa vê a mensagem genérica. */
export class AbacatePayError extends HttpException {
  constructor(readonly providerMessage: string) {
    super("Não foi possível falar com o serviço de pagamento. Tente novamente em instantes.", ErrorCode.SERVICE_UNAVAILABLE, 502);
  }
}

/** Chama a API v2 da Abacate Pay. GET sem corpo, POST com corpo; devolve o `data` da resposta. */
export async function abacatepay<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(BASE_URL + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await response.json().catch(() => null)) as { success?: boolean; data?: T; error?: string } | null;
  if (!response.ok || !json?.success) {
    console.error(`Abacate Pay ${path} falhou:`, response.status, json?.error);
    throw new AbacatePayError(json?.error ?? `HTTP ${response.status}`);
  }
  return json.data as T;
}

const sameText = (a: string, b: string) => {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * Confere as duas provas do webhook: o segredo que a Abacate Pay manda na query (`webhookSecret`), que prova a origem,
 * e o HMAC do corpo cru (`X-Webhook-Signature`), que prova que o corpo não foi alterado.
 */
export function verifyWebhook(rawBody: Buffer, secretFromQuery: unknown, signature: string | undefined) {
  const secret = process.env.ABACATEPAY_WEBHOOK_SECRET;
  if (!secret) throw unavailable("Webhook da Abacate Pay não configurado.");
  if (typeof secretFromQuery !== "string" || !sameText(secretFromQuery, secret)) return false;
  const expected = crypto.createHmac("sha256", WEBHOOK_HMAC_KEY).update(rawBody).digest("base64");
  return typeof signature === "string" && sameText(signature, expected);
}

/** Só para os testes: assina um corpo como a Abacate Pay assinaria. */
export const signWebhookBody = (rawBody: string) => crypto.createHmac("sha256", WEBHOOK_HMAC_KEY).update(rawBody).digest("base64");
