import { prisma } from "../../lib/prisma.ts";
import {
  adminEmails,
  BillingInterval,
  COMMISSION_HOLD_DAYS,
  commissionCents,
  commissionPct,
  ENTITLED_STATUSES,
  PRO_PRICES,
  subscriptionMethods,
  webUrl,
} from "../config/billing.ts";
import { PLANS } from "../config/plans.ts";
import { HttpException, ErrorCode } from "../exceptions/root.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { abacatepay, AbacatePayError } from "../lib/abacatepay.ts";

const DAY_MS = 86_400_000;
const settings = () => `${webUrl()}/dashboard/configuracoes?secao=plano`;
const notConfigured = () => new HttpException("A cobrança ainda não está configurada. Tente novamente mais tarde.", ErrorCode.SERVICE_UNAVAILABLE, 503);

/** Preços, limites e regras de afiliado, sem login: é o que a landing mostra. */
export function GetPublicPlansService() {
  return {
    prices: { monthlyCents: PRO_PRICES.monthly.cents, yearlyCents: PRO_PRICES.yearly.cents },
    limits: PLANS,
    affiliate: { commissionPct: commissionPct(), holdDays: COMMISSION_HOLD_DAYS },
  };
}

export async function GetBillingService(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, plan: true, subscriptionStatus: true, currentPeriodEnd: true },
  });
  if (!user) throw new NotFoundException("Usuário não encontrado.", ErrorCode.USER_NOT_FOUND);
  return {
    plan: user.plan,
    subscriptionStatus: user.subscriptionStatus,
    currentPeriodEnd: user.currentPeriodEnd,
    prices: { monthlyCents: PRO_PRICES.monthly.cents, yearlyCents: PRO_PRICES.yearly.cents },
    // Os limites de cada plano, para a tela de upgrade comparar sem repetir números no web.
    limits: PLANS,
    // Sem chave e sem produtos o botão de assinar não aparece: nada de checkout que só falha.
    checkoutAvailable: Boolean(process.env.ABACATEPAY_API_KEY && process.env[PRO_PRICES.monthly.env] && process.env[PRO_PRICES.yearly.env]),
    paymentMethods: subscriptionMethods(),
    isAdmin: adminEmails().includes(user.email.toLowerCase()),
  };
}

async function customerFor(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, abacateCustomerId: true } });
  if (!user) throw new NotFoundException("Usuário não encontrado.", ErrorCode.USER_NOT_FOUND);
  if (user.abacateCustomerId) return user.abacateCustomerId;
  // A Abacate Pay devolve o cliente já existente quando o e-mail se repete, então criar de novo é seguro.
  const customer = await abacatepay<{ id: string }>("/customers/create", { email: user.email, name: user.name, metadata: { userId } });
  await prisma.user.update({ where: { id: userId }, data: { abacateCustomerId: customer.id } });
  return customer.id;
}

/** Checkout de assinatura hospedado pela Abacate Pay. A assinatura só existe depois do pagamento (webhook subscription.completed). */
export async function CreateCheckoutService(userId: string, interval: BillingInterval) {
  const product = process.env[PRO_PRICES[interval].env];
  if (!product) throw notConfigured();
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  if (current?.plan === "PRO") {
    throw new HttpException("Você já tem o Pro. Para trocar de período, cancele e assine de novo quando o atual terminar.", ErrorCode.INVALID_DATA, 400);
  }
  const checkout = await abacatepay<{ url: string }>("/subscriptions/create", {
    items: [{ id: product, quantity: 1 }],
    customerId: await customerFor(userId),
    // O webhook acha a conta pelo cliente; o externalId é a segunda forma de achar.
    externalId: userId,
    metadata: { userId },
    methods: subscriptionMethods(),
    returnUrl: `${settings()}&checkout=cancelado`,
    completionUrl: `${settings()}&checkout=sucesso`,
  });
  return { url: checkout.url };
}

/** Cancela na Abacate Pay. Assinatura que já não está ativa lá (cancelada pelo dashboard, por exemplo) conta como cancelada. */
async function cancelAtAbacate(subscriptionId: string) {
  try {
    await abacatepay("/subscriptions/cancel", { id: subscriptionId });
  } catch (error) {
    if (!(error instanceof AbacatePayError && /not active|doesn.?t exist/i.test(error.providerMessage))) throw error;
  }
}

/**
 * Cancela a renovação. O Pro continua até o fim do período já pago (o cron diário rebaixa depois).
 * Não usamos o portal do cliente da Abacate Pay porque ele deixa a pessoa reembolsar sozinha qualquer pagamento, sem aprovação.
 */
export async function CancelSubscriptionService(userId: string, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { abacateSubscriptionId: true, subscriptionStatus: true, currentPeriodEnd: true } });
  if (!user?.abacateSubscriptionId || !ENTITLED_STATUSES.includes(user.subscriptionStatus ?? "")) {
    throw new HttpException("Você não tem uma assinatura ativa para cancelar.", ErrorCode.INVALID_DATA, 400);
  }
  // Marca antes de chamar a API: o webhook subscription.cancelled pode chegar antes da resposta e precisa saber que foi a pessoa que cancelou.
  await prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: "CANCELED" } });
  try {
    await cancelAtAbacate(user.abacateSubscriptionId);
  } catch (error) {
    await prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: user.subscriptionStatus } });
    throw error;
  }
  const paidUntil = user.currentPeriodEnd && user.currentPeriodEnd > now ? user.currentPeriodEnd : null;
  if (!paidUntil) await prisma.user.update({ where: { id: userId }, data: { plan: "FREE" } });
  return { currentPeriodEnd: paidUntil };
}

/** Antes de apagar a conta: assinatura ativa continuaria cobrando alguém que não existe mais aqui. */
export const CancelSubscriptionForDeletionService = cancelAtAbacate;

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

/** Só os campos usados. A Abacate Pay pede para não validar o payload inteiro: campos novos podem surgir. */
type EventData = {
  subscription?: { id?: string; frequency?: string } | null;
  payment?: { id?: string; paidAmount?: number | null } | null;
  checkout?: { id?: string; externalId?: string | null; paidAmount?: number | null } | null;
};
export type AbacateEvent = { id: string; event: string; devMode?: boolean; data?: EventData };

type Dependencies = {
  /** Fim do período pago. O evento não traz; a assinatura na API traz (`currentPeriodEnd`). */
  periodEnd: (subscriptionId: string) => Promise<Date | null>;
  /** O id da conta (externalId) do checkout, para quando o evento vem sem ele. */
  checkoutExternalId: (checkoutId: string) => Promise<string | null>;
};

/** "2026-12-10" vale até o fim do dia em Brasília; um ISO completo vale como está. */
const endOfDay = (value: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999-03:00` : value);

const live: Dependencies = {
  periodEnd: async (subscriptionId) => {
    // /subscriptions/list e não /subscriptions/get: o get?id= devolveu dado velho (cache) no teste em Dev mode.
    const list = await abacatepay<{ id: string; currentPeriodEnd?: string | null }[]>(`/subscriptions/list?id=${encodeURIComponent(subscriptionId)}`);
    const subscription = list.find((item) => item.id === subscriptionId);
    const end = subscription?.currentPeriodEnd ? endOfDay(subscription.currentPeriodEnd) : null;
    return end && !Number.isNaN(end.getTime()) ? end : null;
  },
  checkoutExternalId: async (checkoutId) =>
    (await abacatepay<{ externalId?: string | null }>(`/subscriptions/checkouts/get?id=${encodeURIComponent(checkoutId)}`)).externalId ?? null,
};

const CYCLE_MONTHS: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUALLY: 6, ANNUALLY: 12 };
const select = { id: true, subscriptionStatus: true, currentPeriodEnd: true, abacateSubscriptionId: true } as const;

/**
 * A conta nunca é achada pelo cliente da Abacate Pay: o checkout troca o cliente pelos dados que a pessoa digita,
 * e o cliente é único por CPF (duas contas pagas com o mesmo CPF dariam no mesmo cliente). Vale a assinatura já ligada
 * à conta ou o externalId do checkout, que é o id da conta.
 */
const userBySubscription = (subscriptionId: string | undefined) =>
  subscriptionId ? prisma.user.findUnique({ where: { abacateSubscriptionId: subscriptionId }, select }) : null;

async function userByCheckout(data: EventData, deps: Dependencies) {
  const checkoutId = data.checkout?.id;
  const externalId = data.checkout?.externalId || (checkoutId ? await deps.checkoutExternalId(checkoutId) : null);
  return externalId ? prisma.user.findUnique({ where: { id: externalId }, select }) : null;
}

type BillingUser = NonNullable<Awaited<ReturnType<typeof userByCheckout>>>;

async function commissionFor(userId: string, data: EventData, now: Date) {
  const paymentId = data.payment?.id ?? data.checkout?.id;
  const amountPaid = data.payment?.paidAmount ?? data.checkout?.paidAmount ?? 0;
  if (!paymentId || !(amountPaid > 0)) return;
  const payer = await prisma.user.findUnique({ where: { id: userId }, select: { referredBy: { select: { id: true, affiliateStatus: true } } } });
  // Afiliado bloqueado não gera comissão nova; a assinatura do indicado segue normal.
  if (!payer?.referredBy || payer.referredBy.affiliateStatus !== "ACTIVE") return;
  const amountCents = commissionCents(amountPaid);
  if (amountCents <= 0) return;
  await prisma.commission.createMany({
    data: [{
      affiliateId: payer.referredBy.id,
      referredUserId: userId,
      paymentId,
      checkoutId: data.checkout?.id ?? null,
      amountCents,
      availableAt: new Date(now.getTime() + COMMISSION_HOLD_DAYS * DAY_MS),
    }],
    skipDuplicates: true,
  });
}

/** Pagamento confirmado (assinatura nova ou renovada): Pro até o fim do período pago, mais a comissão. */
async function paid(user: BillingUser, subscriptionId: string, data: EventData, now: Date, deps: Dependencies) {
  let periodEnd = await deps.periodEnd(subscriptionId);
  if (!periodEnd) {
    // Sem a data da API, um ciclo a partir do fim do período atual (ou de agora, se já acabou).
    periodEnd = new Date(user.currentPeriodEnd && user.currentPeriodEnd > now ? user.currentPeriodEnd : now);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + (CYCLE_MONTHS[data.subscription?.frequency ?? ""] ?? 1));
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { plan: "PRO", subscriptionStatus: "ACTIVE", currentPeriodEnd: periodEnd, abacateSubscriptionId: subscriptionId },
  });
  await commissionFor(user.id, data, now);
}

async function applyEvent(event: AbacateEvent, now: Date, deps: Dependencies) {
  const data = event.data ?? {};
  const subscriptionId = data.subscription?.id;
  switch (event.event) {
    case "subscription.completed": {
      if (!subscriptionId) return;
      const user = (await userBySubscription(subscriptionId)) ?? (await userByCheckout(data, deps));
      // Erro (e não silêncio): 5xx faz a Abacate Pay reenviar, e o log mostra o pagamento sem conta.
      if (!user) throw new Error(`Abacate Pay: assinatura ${subscriptionId} paga sem conta correspondente (checkout ${data.checkout?.id}).`);
      if (user.abacateSubscriptionId && user.abacateSubscriptionId !== subscriptionId && ENTITLED_STATUSES.includes(user.subscriptionStatus ?? "")) {
        // Duas assinaturas pagas (dois checkouts abertos e pagos): mantém a primeira e corta a renovação da segunda.
        console.error("Abacate Pay: assinatura duplicada cancelada; reembolse o pagamento pelo dashboard", event.id, subscriptionId, data.checkout?.id);
        await cancelAtAbacate(subscriptionId);
        return;
      }
      return paid(user, subscriptionId, data, now, deps);
    }
    case "subscription.renewed": {
      const user = await userBySubscription(subscriptionId);
      if (user && subscriptionId) await paid(user, subscriptionId, data, now, deps);
      return;
    }
    case "subscription.payment_failed": {
      // A Abacate Pay tenta de novo (retryPolicy); o acesso continua até ela desistir e mandar subscription.cancelled.
      const user = await userBySubscription(subscriptionId);
      if (user) await prisma.user.update({ where: { id: user.id }, data: { subscriptionStatus: "PAST_DUE" } });
      return;
    }
    case "subscription.cancelled": {
      // Só a assinatura ligada à conta: o cancelamento de uma antiga (já trocada) não acha ninguém aqui.
      const user = await userBySubscription(subscriptionId);
      if (!user) return;
      // Quem cancelou por aqui (status já CANCELED) fica com o Pro até o fim do que pagou; qualquer outro cancelamento corta na hora.
      const keepUntilPeriodEnd = user.subscriptionStatus === "CANCELED" && user.currentPeriodEnd && user.currentPeriodEnd > now;
      await prisma.user.update({ where: { id: user.id }, data: { subscriptionStatus: "CANCELED", ...(keepUntilPeriodEnd ? {} : { plan: "FREE" }) } });
      return;
    }
    case "checkout.refunded": {
      const checkoutId = data.checkout?.id;
      if (!checkoutId) return;
      // Dentro da carência (ou congelada): a comissão deixa de existir. Disponível ou paga já passou da carência e fica para o admin decidir.
      await prisma.commission.updateMany({ where: { checkoutId, status: { in: ["PENDING", "FROZEN"] } }, data: { status: "CANCELED" } });
      // Reembolso de assinatura ativa vem junto com subscription.cancelled, que já rebaixa. Aqui só fecha o caso de quem
      // já tinha cancelado e ainda estava no período pago: o reembolso acaba com esse período.
      const externalId = data.checkout?.externalId;
      const user = externalId ? await prisma.user.findUnique({ where: { id: externalId }, select }) : null;
      if (user?.subscriptionStatus === "CANCELED") await prisma.user.update({ where: { id: user.id }, data: { plan: "FREE" } });
      return;
    }
  }
}

/** Idempotente: o id do evento é gravado antes de processar; se o processamento falhar, o registro sai para a Abacate Pay poder repetir. */
export async function HandleAbacateEventService(event: AbacateEvent, deps: Partial<Dependencies> = {}, now = new Date()) {
  // Evento de Dev mode só vale enquanto a loja usa chave de Dev; com chave de produção ele nunca mexe em conta.
  if (event.devMode === true && process.env.ABACATEPAY_API_KEY?.startsWith("abc_prod_")) return { duplicate: false, ignored: true };
  const { count } = await prisma.billingEvent.createMany({ data: [{ id: event.id, type: event.event }], skipDuplicates: true });
  if (count === 0) return { duplicate: true };
  try {
    await applyEvent(event, now, { ...live, ...deps });
  } catch (error) {
    await prisma.billingEvent.deleteMany({ where: { id: event.id } });
    throw error;
  }
  return { duplicate: false };
}

/** Cron diário: comissão pendente que passou da carência fica disponível para pagamento. */
export async function ReleaseCommissionsService(now = new Date()) {
  const { count } = await prisma.commission.updateMany({
    where: { status: "PENDING", availableAt: { lte: now }, affiliate: { affiliateStatus: "ACTIVE" } },
    data: { status: "AVAILABLE" },
  });
  return { released: count };
}

/** Cron diário: assinatura cancelada cujo período pago acabou volta para o gratuito. */
export async function ExpireCanceledSubscriptionsService(now = new Date()) {
  const { count } = await prisma.user.updateMany({
    where: { plan: "PRO", subscriptionStatus: "CANCELED", currentPeriodEnd: { lte: now } },
    data: { plan: "FREE" },
  });
  return { expired: count };
}
