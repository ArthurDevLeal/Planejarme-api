// Preços e regras de cobrança e de afiliados. Valores provisórios: troque aqui.
// Os preços daqui são só os exibidos; o valor cobrado é o do Price do Stripe (STRIPE_PRICE_PRO_*).
export const PRO_PRICES = {
  monthly: { cents: 1490, env: "STRIPE_PRICE_PRO_MONTHLY" },
  yearly: { cents: 11900, env: "STRIPE_PRICE_PRO_YEARLY" },
} as const;

export type BillingInterval = keyof typeof PRO_PRICES;

/** Percentual de cada fatura paga do indicado que vira comissão. */
export const commissionPct = () => {
  const value = Number(process.env.AFFILIATE_COMMISSION_PCT);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 30;
};

/** Dias até a comissão ficar disponível; reembolso nesse intervalo cancela a comissão. */
export const COMMISSION_HOLD_DAYS = 30;

/** Assinatura nestes estados dá direito ao Pro. `past_due` mantém o acesso enquanto o Stripe tenta cobrar de novo. */
export const ENTITLED_STATUSES = ["active", "trialing", "past_due"];

export const commissionCents = (amountPaidCents: number, pct = commissionPct()) => Math.floor((amountPaidCents * pct) / 100);

export const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

export const webUrl = () => (process.env.WEB_URL || "http://localhost:3000").replace(/\/$/, "");
