import type Stripe from "stripe";
import { prisma } from "../../lib/prisma.ts";
import { adminEmails, BillingInterval, COMMISSION_HOLD_DAYS, commissionCents, commissionPct, ENTITLED_STATUSES, PRO_PRICES, webUrl } from "../config/billing.ts";
import { PLANS } from "../config/plans.ts";
import { HttpException, ErrorCode } from "../exceptions/root.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { stripe } from "../lib/stripe.ts";

const DAY_MS = 86_400_000;
const settings = `${webUrl()}/dashboard/configuracoes?secao=plano`;

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
    // Sem chave e sem preços o botão de assinar não aparece: nada de checkout que só falha.
    checkoutAvailable: Boolean(process.env.STRIPE_SECRET_KEY && process.env[PRO_PRICES.monthly.env] && process.env[PRO_PRICES.yearly.env]),
    isAdmin: adminEmails().includes(user.email.toLowerCase()),
  };
}

async function customerFor(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, stripeCustomerId: true } });
  if (!user) throw new NotFoundException("Usuário não encontrado.", ErrorCode.USER_NOT_FOUND);
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe().customers.create({ email: user.email, name: user.name, metadata: { userId } });
  await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/** Checkout hospedado pelo Stripe. Assinatura é no cartão: Pix recorrente não existe para conta brasileira (ver STRIPE-GO-LIVE.md). */
export async function CreateCheckoutService(userId: string, interval: BillingInterval) {
  const price = process.env[PRO_PRICES[interval].env];
  if (!price) throw new HttpException("A cobrança ainda não está configurada. Tente novamente mais tarde.", ErrorCode.SERVICE_UNAVAILABLE, 503);
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  if (current?.plan === "PRO") {
    throw new HttpException("Você já assina o Pro. Use \"Gerenciar assinatura\" para trocar de plano.", ErrorCode.INVALID_DATA, 400);
  }
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: await customerFor(userId),
    client_reference_id: userId,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { userId } },
    locale: "pt-BR",
    success_url: `${settings}&checkout=sucesso`,
    cancel_url: `${settings}&checkout=cancelado`,
  });
  return { url: session.url };
}

export async function CreatePortalService(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } });
  if (!user?.stripeCustomerId) throw new HttpException("Você ainda não tem uma assinatura para gerenciar.", ErrorCode.INVALID_DATA, 400);
  const session = await stripe().billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: settings, locale: "pt-BR" });
  return { url: session.url };
}

/** Antes de apagar a conta: assinatura ativa continuaria cobrando um cliente que não existe mais aqui. */
export async function CancelSubscriptionsService(stripeCustomerId: string) {
  const subscriptions = await stripe().subscriptions.list({ customer: stripeCustomerId, status: "all", limit: 20 });
  for (const subscription of subscriptions.data) {
    if (!["canceled", "incomplete_expired"].includes(subscription.status)) await stripe().subscriptions.cancel(subscription.id);
  }
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : value?.id ?? null);

type Dependencies = {
  /** A cobrança reembolsada não traz a fatura: é preciso perguntar ao Stripe qual fatura aquele pagamento quitou. */
  invoiceForPaymentIntent: (paymentIntentId: string) => Promise<string | null>;
  now: () => Date;
};

const live: Dependencies = {
  invoiceForPaymentIntent: async (paymentIntentId) => {
    const payments = await stripe().invoicePayments.list({ payment: { type: "payment_intent", payment_intent: paymentIntentId }, limit: 1 });
    return idOf(payments.data[0]?.invoice);
  },
  now: () => new Date(),
};

async function syncSubscription(subscription: Stripe.Subscription, deleted: boolean) {
  const customerId = idOf(subscription.customer);
  const user =
    (customerId && (await prisma.user.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } }))) ||
    (subscription.metadata?.userId && (await prisma.user.findUnique({ where: { id: subscription.metadata.userId }, select: { id: true } })));
  if (!user) return;
  const status = deleted ? "canceled" : subscription.status;
  const periodEnd = subscription.items?.data?.[0]?.current_period_end;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      plan: ENTITLED_STATUSES.includes(status) ? "PRO" : "FREE",
      subscriptionStatus: status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      ...(customerId ? { stripeCustomerId: customerId } : {}),
    },
  });
}

async function commissionForInvoice(invoice: Stripe.Invoice, now: Date) {
  const customerId = idOf(invoice.customer);
  if (!customerId || !invoice.id || invoice.amount_paid <= 0) return;
  const payer = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true, referredBy: { select: { id: true, affiliateStatus: true } } },
  });
  // Afiliado bloqueado não gera comissão nova; a assinatura do indicado segue normal.
  if (!payer?.referredBy || payer.referredBy.affiliateStatus !== "ACTIVE") return;
  const amountCents = commissionCents(invoice.amount_paid);
  if (amountCents <= 0) return;
  await prisma.commission.createMany({
    data: [{
      affiliateId: payer.referredBy.id,
      referredUserId: payer.id,
      stripeInvoiceId: invoice.id,
      amountCents,
      availableAt: new Date(now.getTime() + COMMISSION_HOLD_DAYS * DAY_MS),
    }],
    skipDuplicates: true,
  });
}

async function applyEvent(event: Stripe.Event, deps: Dependencies) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const customerId = idOf(session.customer);
      if (session.mode !== "subscription" || !session.client_reference_id || !customerId) return;
      // O estado da assinatura chega em customer.subscription.*; aqui só se liga o cliente do Stripe à conta.
      await prisma.user.updateMany({ where: { id: session.client_reference_id }, data: { stripeCustomerId: customerId } });
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return syncSubscription(event.data.object, false);
    case "customer.subscription.deleted":
      return syncSubscription(event.data.object, true);
    case "invoice.paid":
      return commissionForInvoice(event.data.object, deps.now());
    case "charge.refunded": {
      const paymentIntentId = idOf(event.data.object.payment_intent);
      const invoiceId = paymentIntentId ? await deps.invoiceForPaymentIntent(paymentIntentId) : null;
      if (!invoiceId) return;
      // Dentro da carência (ou congelada): a comissão deixa de existir. Disponível ou paga já passou da carência e fica para o admin decidir.
      await prisma.commission.updateMany({ where: { stripeInvoiceId: invoiceId, status: { in: ["PENDING", "FROZEN"] } }, data: { status: "CANCELED" } });
      return;
    }
  }
}

/** Idempotente: o id do evento é gravado antes de processar; se o processamento falhar, o registro sai para o Stripe poder repetir. */
export async function HandleStripeEventService(event: Stripe.Event, deps: Partial<Dependencies> = {}) {
  const { count } = await prisma.stripeEvent.createMany({ data: [{ id: event.id, type: event.type }], skipDuplicates: true });
  if (count === 0) return { duplicate: true };
  try {
    await applyEvent(event, { ...live, ...deps });
  } catch (error) {
    await prisma.stripeEvent.deleteMany({ where: { id: event.id } });
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
