// Preços e regras de cobrança e de afiliados. Valores provisórios: troque aqui.
// Os preços daqui são só os exibidos; o valor cobrado é o do produto na Abacate Pay (ABACATEPAY_PRODUCT_PRO_*).
export const PRO_PRICES = {
  monthly: { cents: 1490, env: "ABACATEPAY_PRODUCT_PRO_MONTHLY" },
  yearly: { cents: 11900, env: "ABACATEPAY_PRODUCT_PRO_YEARLY" },
} as const;

export type BillingInterval = keyof typeof PRO_PRICES;

/**
 * Meios aceitos na assinatura. Pix recorrente (Pix Automático) só funciona depois que a Abacate Pay habilita o recurso na loja;
 * até lá, CARD. Com o Pix liberado: ABACATEPAY_SUBSCRIPTION_METHODS=PIX,CARD.
 */
export const subscriptionMethods = () => {
  const methods = (process.env.ABACATEPAY_SUBSCRIPTION_METHODS ?? "CARD").split(",").map((m) => m.trim().toUpperCase());
  const valid = methods.filter((m): m is "PIX" | "CARD" => m === "PIX" || m === "CARD");
  return valid.length ? [...new Set(valid)] : ["CARD" as const];
};

/** Percentual de cada pagamento do indicado que vira comissão. */
export const commissionPct = () => {
  const value = Number(process.env.AFFILIATE_COMMISSION_PCT);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 30;
};

/** Dias até a comissão ficar disponível; reembolso nesse intervalo cancela a comissão. */
export const COMMISSION_HOLD_DAYS = 30;

/** subscriptionStatus: ACTIVE, PAST_DUE (cobrança falhou, a Abacate Pay tenta de novo; mantém o Pro) e CANCELED. */
export const ENTITLED_STATUSES = ["ACTIVE", "PAST_DUE"];

export const commissionCents = (amountPaidCents: number, pct = commissionPct()) => Math.floor((amountPaidCents * pct) / 100);

export const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

export const webUrl = () => (process.env.WEB_URL || "http://localhost:3000").replace(/\/$/, "");
