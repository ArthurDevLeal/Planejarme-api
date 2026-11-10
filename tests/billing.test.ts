import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import Stripe from "stripe";
import { prisma } from "../lib/prisma.ts";
import { commissionCents } from "../src/config/billing.ts";
import { PLANS } from "../src/config/plans.ts";
import { normalizeEmail } from "../src/services/affiliate-service.ts";
import { HandleStripeEventService, ReleaseCommissionsService } from "../src/services/billing-service.ts";

const dbTest = { skip: process.env.RUN_DB_TESTS !== "1" };
const SECRET = "whsec_teste_local";
let server: Server;
let baseUrl = "";

before(async () => {
  // A assinatura do webhook só depende deste segredo; nenhuma chave do Stripe é usada nos testes.
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  process.env.VERCEL = "1"; // impede o app.listen na porta fixa de src/index.ts
  const { default: app } = await import("../src/index.ts");
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

const event = (type: string, object: Record<string, unknown>, id = `evt_${randomUUID()}`) => ({ id, object: "event", type, data: { object } });

async function deliver(payload: object, signature?: string) {
  const body = JSON.stringify(payload);
  const header = signature ?? Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });
  const response = await fetch(`${baseUrl}/webhooks/stripe`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": header }, body });
  return { status: response.status, body: await response.json() };
}

test("comissão: percentual sobre o valor pago, arredondado para baixo", () => {
  assert.equal(commissionCents(1490, 30), 447);
  assert.equal(commissionCents(11900, 30), 3570);
  assert.equal(commissionCents(1, 30), 0);
  assert.equal(commissionCents(1490, 0), 0);
});

test("auto-indicação: maiúsculas e +alias são o mesmo e-mail", () => {
  assert.equal(normalizeEmail(" Ana+Promo@Example.com "), "ana@example.com");
  assert.notEqual(normalizeEmail("ana@example.com"), normalizeEmail("ana.b@example.com"));
});

test("webhook: assinatura inválida ou ausente é recusada antes de tocar no banco", async () => {
  const forged = await deliver(event("customer.subscription.deleted", { id: "sub_x", customer: "cus_x" }), "t=1,v1=deadbeef");
  assert.equal(forged.status, 400);
  assert.match(forged.body.message, /Assinatura do webhook inválida/);
  const body = JSON.stringify(event("invoice.paid", {}));
  const other = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_outro_segredo" });
  assert.equal((await deliver(JSON.parse(body), other)).status, 400);
  const missing = await fetch(`${baseUrl}/webhooks/stripe`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  assert.equal(missing.status, 400);
});

test("rotas de cobrança, afiliados e admin exigem login", async () => {
  for (const [method, path] of [["GET", "/billing/me"], ["POST", "/billing/checkout"], ["POST", "/billing/portal"], ["GET", "/affiliates/me"], ["GET", "/admin/affiliates"]]) {
    assert.equal((await fetch(baseUrl + path, { method })).status, 401, path);
  }
});

test("assinatura, indicação, comissão, reembolso e bloqueio do afiliado", dbTest, async () => {
  const tag = randomUUID().slice(0, 8);
  const mail = (name: string) => `${name}-${tag}@example.invalid`;
  const [affiliate, admin] = await Promise.all(
    ["afiliado", "admin"].map((name) => prisma.user.create({ data: { name: `${name} teste`, email: mail(name), passwordHash: "x" } })),
  );
  const adminsBefore = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = `outro@example.invalid, ${admin.email.toUpperCase()}`;
  const tokenFor = (id: string) => jwt.sign({ id }, process.env.JWT_SECRET!, { expiresIn: "5m" });
  const created: string[] = [affiliate.id, admin.id];

  async function call(path: string, method = "GET", input?: unknown, as?: string) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { "Content-Type": "application/json", ...(as ? { Authorization: `Bearer ${tokenFor(as)}` } : {}) },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
  }
  async function signUp(email: string, ref?: string) {
    const response = await call("/users", "POST", { name: "Pessoa Indicada", email, password: "senha-de-teste", ref });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    created.push(response.body.data.id);
    for (const hidden of ["passwordHash", "stripeCustomerId", "referredById", "affiliateBlockReason"]) assert.equal(hidden in response.body.data, false, hidden);
    return prisma.user.findUniqueOrThrow({ where: { id: response.body.data.id } });
  }
  const commissionsOf = () => prisma.commission.findMany({ where: { affiliateId: affiliate.id }, orderBy: { createdAt: "asc" } });

  try {
    // Entrar no programa: um clique, código de 8 caracteres e link com ?ref=.
    assert.equal((await call("/affiliates/me", "GET", undefined, affiliate.id)).body.data.status, "NONE");
    const joined = (await call("/affiliates/join", "POST", undefined, affiliate.id)).body.data;
    assert.equal(joined.status, "ACTIVE");
    assert.match(joined.code, /^[A-Z2-9]{8}$/);
    assert.ok(joined.link.endsWith(`/?ref=${joined.code}`));
    assert.equal((await call("/affiliates/join", "POST", undefined, affiliate.id)).body.data.code, joined.code, "entrar de novo não troca o código");

    // Atribuição no cadastro; auto-indicação e código inexistente não atribuem.
    const referred = await signUp(mail("indicado"), joined.code.toLowerCase());
    assert.equal(referred.referredById, affiliate.id);
    assert.equal(referred.plan, "FREE");
    assert.equal((await signUp(`afiliado-${tag}+promo@EXAMPLE.invalid`, joined.code)).referredById, null, "mesmo e-mail com +alias");
    assert.equal((await signUp(mail("sem-codigo"), "ZZZZZZZZ")).referredById, null);

    // Upgrade: checkout concluído liga o cliente; a assinatura ativa vira PRO.
    const customer = `cus_${tag}`;
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86_400;
    const subscription = (status: string) => ({ id: `sub_${tag}`, customer, status, metadata: { userId: referred.id }, items: { data: [{ current_period_end: periodEnd }] } });
    assert.equal((await deliver(event("checkout.session.completed", { id: "cs_1", mode: "subscription", client_reference_id: referred.id, customer }))).status, 200);
    const activated = event("customer.subscription.created", subscription("active"));
    assert.deepEqual((await deliver(activated)).body.data, { duplicate: false });
    let user = await prisma.user.findUniqueOrThrow({ where: { id: referred.id } });
    assert.deepEqual([user.plan, user.subscriptionStatus, user.stripeCustomerId], ["PRO", "active", customer]);
    assert.equal(user.currentPeriodEnd?.getTime(), periodEnd * 1000);
    const billing = (await call("/billing/me", "GET", undefined, referred.id)).body.data;
    assert.deepEqual([billing.plan, billing.isAdmin, billing.prices.monthlyCents], ["PRO", false, 1490]);
    assert.equal((await call("/users/me/usage", "GET", undefined, referred.id)).body.data.limitBytes, PLANS.PRO.storageBytes);

    // Evento repetido: o Stripe reentrega, nada muda na segunda vez.
    await prisma.user.update({ where: { id: referred.id }, data: { subscriptionStatus: "marcador" } });
    assert.deepEqual((await deliver(activated)).body.data, { duplicate: true });
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: referred.id } })).subscriptionStatus, "marcador");

    // Comissão recorrente: uma por fatura paga, pendente por 30 dias.
    const invoice = (id: string, amount = 1490) => ({ id, customer, amount_paid: amount });
    await deliver(event("invoice.paid", invoice(`in_1_${tag}`)));
    await deliver(event("invoice.paid", invoice(`in_1_${tag}`)));
    let commissions = await commissionsOf();
    assert.equal(commissions.length, 1, "mesma fatura em outro evento não duplica");
    assert.deepEqual([commissions[0].amountCents, commissions[0].status, commissions[0].referredUserId], [447, "PENDING", referred.id]);
    const hold = commissions[0].availableAt.getTime() - Date.now();
    assert.ok(hold > 29 * 86_400_000 && hold <= 30 * 86_400_000);
    await deliver(event("invoice.paid", invoice(`in_0_${tag}`, 0)));
    assert.equal((await commissionsOf()).length, 1, "fatura de valor zero não gera comissão");

    // Carência: antes dos 30 dias continua pendente; depois fica disponível.
    await ReleaseCommissionsService(new Date(Date.now() + 29 * 86_400_000));
    assert.equal((await commissionsOf())[0].status, "PENDING");
    await ReleaseCommissionsService(new Date(Date.now() + 31 * 86_400_000));
    assert.equal((await commissionsOf())[0].status, "AVAILABLE");

    // Reembolso dentro da carência cancela a comissão daquela fatura, e só ela.
    await deliver(event("invoice.paid", invoice(`in_2_${tag}`)));
    const refund = event("charge.refunded", { id: "ch_1", payment_intent: `pi_2_${tag}` });
    await HandleStripeEventService(refund as unknown as Stripe.Event, { invoiceForPaymentIntent: async (paymentIntent) => (paymentIntent === `pi_2_${tag}` ? `in_2_${tag}` : null) });
    commissions = await commissionsOf();
    assert.deepEqual(commissions.map((c) => c.status), ["AVAILABLE", "CANCELED"]);

    // Painel do afiliado.
    await deliver(event("invoice.paid", invoice(`in_3_${tag}`)));
    const panel = (await call("/affiliates/me", "GET", undefined, affiliate.id)).body.data;
    assert.deepEqual(panel.totals, { AVAILABLE: 447, CANCELED: 447, PENDING: 447 });
    assert.deepEqual(panel.referrals.map((r: { name: string; plan: string }) => [r.name, r.plan]), [["Pessoa", "PRO"]]);
    assert.equal(JSON.stringify(panel).includes("example.invalid"), false, "o afiliado não vê e-mail de quem indicou");

    // Admin: só e-mails de ADMIN_EMAILS.
    assert.equal((await call("/admin/affiliates", "GET", undefined, affiliate.id)).status, 403);
    const listed = (await call("/admin/affiliates", "GET", undefined, admin.id)).body.data.find((a: { id: string }) => a.id === affiliate.id);
    assert.deepEqual([listed.referralCount, listed.affiliateStatus], [1, "ACTIVE"]);
    assert.equal((await call("/billing/me", "GET", undefined, admin.id)).body.data.isAdmin, true);

    // Bloqueio: exige motivo, congela o que não foi pago, o link para de atribuir e não nascem comissões novas.
    assert.equal((await call(`/admin/affiliates/${affiliate.id}/block`, "POST", { reason: "" }, admin.id)).status, 400);
    assert.equal((await call(`/admin/affiliates/${affiliate.id}/block`, "POST", { reason: "Suspeita de fraude" }, admin.id)).status, 200);
    assert.deepEqual((await commissionsOf()).map((c) => c.status), ["FROZEN", "CANCELED", "FROZEN"]);
    assert.deepEqual((await call("/affiliates/me", "GET", undefined, affiliate.id)).body.data, { status: "BLOCKED", commissionPct: panel.commissionPct, holdDays: 30 });
    assert.equal((await signUp(mail("depois-do-bloqueio"), joined.code)).referredById, null);
    await deliver(event("invoice.paid", invoice(`in_4_${tag}`)));
    assert.equal((await commissionsOf()).length, 3);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: referred.id } })).plan, "PRO", "a assinatura do indicado segue normal");
    await ReleaseCommissionsService(new Date(Date.now() + 90 * 86_400_000));
    assert.deepEqual((await commissionsOf()).map((c) => c.status), ["FROZEN", "CANCELED", "FROZEN"], "congelada não é liberada pelo cron");

    // Admin decide: paga uma congelada; a outra volta ao normal quando o bloqueio é desfeito.
    assert.equal((await call(`/admin/commissions/${commissions[0].id}/pay`, "POST", undefined, admin.id)).status, 200);
    assert.equal((await call(`/admin/commissions/${commissions[0].id}/pay`, "POST", undefined, admin.id)).status, 400, "pagar duas vezes");
    assert.equal((await call(`/admin/affiliates/${affiliate.id}/unblock`, "POST", undefined, admin.id)).status, 200);
    const after = await commissionsOf();
    assert.deepEqual(after.map((c) => c.status), ["PAID", "CANCELED", "PENDING"]);
    assert.ok(after[0].paidAt);
    const history = await prisma.affiliateEvent.findMany({ where: { affiliateId: affiliate.id }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(history.map((h) => h.action), ["BLOCK", "COMMISSION_PAID", "UNBLOCK"]);
    assert.deepEqual([history[0].reason, history[0].adminEmail], ["Suspeita de fraude", admin.email]);
    assert.equal((await call("/admin/commissions?status=PAID", "GET", undefined, admin.id)).body.data.some((c: { id: string }) => c.id === after[0].id), true);

    // Downgrade: assinatura encerrada volta para FREE, sem apagar nada.
    await deliver(event("customer.subscription.updated", subscription("past_due")));
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: referred.id } })).plan, "PRO", "cobrança em nova tentativa mantém o acesso");
    await deliver(event("customer.subscription.deleted", subscription("canceled")));
    user = await prisma.user.findUniqueOrThrow({ where: { id: referred.id } });
    assert.deepEqual([user.plan, user.subscriptionStatus], ["FREE", "canceled"]);
    assert.equal((await call("/users/me/usage", "GET", undefined, referred.id)).body.data.limitBytes, PLANS.FREE.storageBytes);
  } finally {
    process.env.ADMIN_EMAILS = adminsBefore;
    await prisma.stripeEvent.deleteMany({ where: { createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, id: { startsWith: "evt_" } } });
    await prisma.user.deleteMany({ where: { id: { in: created } } });
  }
});
