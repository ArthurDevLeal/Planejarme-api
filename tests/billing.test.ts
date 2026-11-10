import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.ts";
import { commissionCents } from "../src/config/billing.ts";
import { PLANS } from "../src/config/plans.ts";
import { normalizeEmail } from "../src/services/affiliate-service.ts";
import { signWebhookBody } from "../src/lib/abacatepay.ts";
import { type AbacateEvent, CancelSubscriptionService, ExpireCanceledSubscriptionsService, HandleAbacateEventService, ReleaseCommissionsService } from "../src/services/billing-service.ts";

const dbTest = { skip: process.env.RUN_DB_TESTS !== "1" };
const SECRET = "segredo_teste_local";
let server: Server;
let baseUrl = "";

before(async () => {
  // O webhook só depende deste segredo e da chave pública do HMAC; nenhuma chamada à Abacate Pay sai dos testes.
  process.env.ABACATEPAY_WEBHOOK_SECRET = SECRET;
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

const event = (type: string, data: Record<string, unknown>, id = `log_${randomUUID()}`) => ({ id, event: type, apiVersion: 2, devMode: true, data });

async function deliver(payload: object, { secret = SECRET, signature }: { secret?: string; signature?: string } = {}) {
  const body = JSON.stringify(payload);
  const response = await fetch(`${baseUrl}/webhooks/abacatepay?webhookSecret=${encodeURIComponent(secret)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-Signature": signature ?? signWebhookBody(body) },
    body,
  });
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

test("webhook: segredo ou HMAC errados são recusados antes de tocar no banco", async () => {
  const payload = event("subscription.cancelled", { subscription: { id: "subs_x" } });
  const wrongSecret = await deliver(payload, { secret: "outro-segredo" });
  assert.equal(wrongSecret.status, 401);
  assert.match(wrongSecret.body.message, /Webhook inválido/);
  assert.equal((await deliver(payload, { signature: signWebhookBody("outro corpo") })).status, 401, "HMAC de outro corpo");
  const body = JSON.stringify(payload);
  const noSecret = await fetch(`${baseUrl}/webhooks/abacatepay`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Signature": signWebhookBody(body) }, body });
  assert.equal(noSecret.status, 401, "sem webhookSecret na URL");
  const noSignature = await fetch(`${baseUrl}/webhooks/abacatepay?webhookSecret=${SECRET}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  assert.equal(noSignature.status, 401, "sem X-Webhook-Signature");
  const garbage = "não é json";
  const unreadable = await fetch(`${baseUrl}/webhooks/abacatepay?webhookSecret=${SECRET}`, { method: "POST", headers: { "Content-Type": "text/plain", "X-Webhook-Signature": signWebhookBody(garbage) }, body: garbage });
  assert.equal(unreadable.status, 400, "corpo autêntico mas ilegível");
});

test("webhook: evento autêntico de assinatura desconhecida é aceito e não muda nada", dbTest, async () => {
  const response = await deliver(event("subscription.payment_failed", { subscription: { id: `subs_desconhecida_${randomUUID()}` } }));
  assert.deepEqual([response.status, response.body.data], [200, { duplicate: false }]);
});

test("planos públicos: preços, limites e regras de afiliado sem login", async () => {
  const response = await fetch(`${baseUrl}/public/plans`);
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.deepEqual(data.prices, { monthlyCents: 1490, yearlyCents: 11900 });
  assert.equal(data.limits.FREE.maxDisciplinesPerSemester, 5);
  assert.equal(data.limits.PRO.maxDisciplinesPerSemester, null);
  assert.deepEqual(data.affiliate, { commissionPct: 30, holdDays: 30 });
});

test("rotas de cobrança, afiliados e admin exigem login", async () => {
  for (const [method, path] of [["GET", "/billing/me"], ["POST", "/billing/checkout"], ["POST", "/billing/cancel"], ["GET", "/affiliates/me"], ["GET", "/admin/affiliates"]]) {
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
    for (const hidden of ["passwordHash", "abacateCustomerId", "abacateSubscriptionId", "referredById", "affiliateBlockReason"]) assert.equal(hidden in response.body.data, false, hidden);
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

    // Upgrade: a assinatura paga vira PRO até o fim do período que a API informa e fica ligada à conta pelo externalId do checkout.
    // As consultas à Abacate Pay (fim do período, externalId do checkout) são trocadas por estas, sem rede.
    const DAY = 86_400_000;
    const customer = `cust_${tag}`;
    const subscriptionId = `subs_${tag}`;
    let apiPeriodEnd: Date | null = new Date(Date.now() + 30 * DAY);
    const checkoutOwners = new Map<string, string>();
    const deps = { periodEnd: async () => apiPeriodEnd, checkoutExternalId: async (id: string) => checkoutOwners.get(id) ?? null };
    const deliver = async (payload: object) => ({ body: { data: await HandleAbacateEventService(payload as AbacateEvent, deps) } });
    const charge = (n: number, amount = 1490, subscription = subscriptionId) => ({
      subscription: { id: subscription, amount, method: "PIX", status: "ACTIVE", frequency: "MONTHLY" },
      customer: { id: customer, name: "Pessoa Indicada", email: "pessoa@example.invalid", taxId: "123.***.***-**" },
      payment: { id: `char_${n}_${tag}`, amount, paidAmount: amount, status: "PAID", methods: ["PIX"] },
      checkout: { id: `bill_${n}_${tag}`, externalId: n === 1 ? referred.id : null, customerId: customer, paidAmount: amount, frequency: "SUBSCRIPTION" },
    });
    const activated = event("subscription.completed", charge(1));
    assert.deepEqual((await deliver(activated)).body.data, { duplicate: false });
    let user = await prisma.user.findUniqueOrThrow({ where: { id: referred.id } });
    assert.deepEqual([user.plan, user.subscriptionStatus, user.abacateSubscriptionId], ["PRO", "ACTIVE", subscriptionId]);
    assert.equal(user.abacateCustomerId, null, "o cliente do evento não é gravado: o checkout pode trocá-lo");
    const firstEnd = user.currentPeriodEnd!.getTime();
    assert.equal(firstEnd, apiPeriodEnd!.getTime(), "fim do período vem da API");
    const billing = (await call("/billing/me", "GET", undefined, referred.id)).body.data;
    assert.deepEqual([billing.plan, billing.isAdmin, billing.prices.monthlyCents], ["PRO", false, 1490]);
    assert.ok(Array.isArray(billing.paymentMethods) && billing.paymentMethods.length > 0);
    assert.equal((await call("/users/me/usage", "GET", undefined, referred.id)).body.data.limitBytes, PLANS.PRO.storageBytes);

    // Evento repetido: a Abacate Pay reentrega com o mesmo id, nada muda na segunda vez.
    await prisma.user.update({ where: { id: referred.id }, data: { subscriptionStatus: "marcador" } });
    assert.deepEqual((await deliver(activated)).body.data, { duplicate: true });
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: referred.id } })).subscriptionStatus, "marcador");
    await prisma.user.update({ where: { id: referred.id }, data: { subscriptionStatus: "ACTIVE" } });

    // Comissão recorrente: uma por pagamento, pendente por 30 dias.
    let commissions = await commissionsOf();
    assert.equal(commissions.length, 1);
    assert.deepEqual([commissions[0].amountCents, commissions[0].status, commissions[0].referredUserId, commissions[0].paymentId], [447, "PENDING", referred.id, `char_1_${tag}`]);
    const hold = commissions[0].availableAt.getTime() - Date.now();
    assert.ok(hold > 29 * DAY && hold <= 30 * DAY);

    // Renovação sem a data da API: um ciclo contado do fim do período atual; pagamento de valor zero não gera comissão.
    apiPeriodEnd = null;
    await deliver(event("subscription.renewed", charge(0, 0)));
    user = await prisma.user.findUniqueOrThrow({ where: { id: referred.id } });
    const extended = user.currentPeriodEnd!.getTime() - firstEnd;
    assert.ok(extended >= 28 * DAY && extended <= 31 * DAY, "renovação soma um mês ao fim do período, não a hoje");
    assert.equal((await commissionsOf()).length, 1, "pagamento de valor zero não gera comissão");

    // Carência: antes dos 30 dias continua pendente; depois fica disponível.
    await ReleaseCommissionsService(new Date(Date.now() + 29 * DAY));
    assert.equal((await commissionsOf())[0].status, "PENDING");
    await ReleaseCommissionsService(new Date(Date.now() + 31 * DAY));
    assert.equal((await commissionsOf())[0].status, "AVAILABLE");

    // Reembolso dentro da carência cancela a comissão daquele pagamento, e só ela. Assinatura ativa não muda aqui.
    await deliver(event("subscription.renewed", charge(2)));
    await deliver(event("checkout.refunded", { checkout: { id: `bill_2_${tag}`, customerId: customer, frequency: "SUBSCRIPTION" }, customer: { id: customer }, reason: "requested_by_customer" }));
    commissions = await commissionsOf();
    assert.deepEqual(commissions.map((c) => c.status), ["AVAILABLE", "CANCELED"]);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: referred.id } })).plan, "PRO", "o rebaixamento vem no subscription.cancelled");

    // Painel do afiliado.
    await deliver(event("subscription.renewed", charge(3)));
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
    await deliver(event("subscription.renewed", charge(4)));
    assert.equal((await commissionsOf()).length, 3);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: referred.id } })).plan, "PRO", "a assinatura do indicado segue normal");
    await ReleaseCommissionsService(new Date(Date.now() + 90 * DAY));
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

    // Cobrança falhou: o Pro continua enquanto a Abacate Pay tenta de novo.
    await deliver(event("subscription.payment_failed", { subscription: { id: subscriptionId, status: "ACTIVE" }, retryNumber: 1 }));
    user = await prisma.user.findUniqueOrThrow({ where: { id: referred.id } });
    assert.deepEqual([user.plan, user.subscriptionStatus], ["PRO", "PAST_DUE"]);

    // Evento de outra assinatura (antiga) da mesma pessoa não mexe na atual.
    await deliver(event("subscription.cancelled", { subscription: { id: `subs_antiga_${tag}`, status: "CANCELLED" }, customer: { id: customer } }));
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: referred.id } })).plan, "PRO");

    // Quem cancelou por aqui fica com o Pro até o fim do período pago; o cron rebaixa depois, sem apagar nada.
    await prisma.user.update({ where: { id: referred.id }, data: { subscriptionStatus: "CANCELED" } }); // o que CancelSubscriptionService grava antes de chamar a API
    await deliver(event("subscription.cancelled", { subscription: { id: subscriptionId, status: "CANCELLED", cancelPolicy: "NOW" }, customer: { id: customer } }));
    user = await prisma.user.findUniqueOrThrow({ where: { id: referred.id } });
    assert.deepEqual([user.plan, user.subscriptionStatus], ["PRO", "CANCELED"]);
    await assert.rejects(CancelSubscriptionService(referred.id), /não tem uma assinatura ativa/, "cancelar de novo não chama a API");
    assert.deepEqual(await ExpireCanceledSubscriptionsService(new Date(user.currentPeriodEnd!.getTime() - 1000)), { expired: 0 });
    await ExpireCanceledSubscriptionsService(new Date(user.currentPeriodEnd!.getTime() + 1000));
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: referred.id } })).plan, "FREE");
    assert.equal((await call("/users/me/usage", "GET", undefined, referred.id)).body.data.limitBytes, PLANS.FREE.storageBytes);

    // Cancelamento que não veio daqui (tentativas esgotadas, dashboard) corta na hora.
    await prisma.user.update({ where: { id: referred.id }, data: { plan: "PRO", subscriptionStatus: "PAST_DUE" } });
    await deliver(event("subscription.cancelled", { subscription: { id: subscriptionId, status: "CANCELLED", cancelledDueTo: "max_payment_retries_exceeded" }, customer: { id: customer } }));
    user = await prisma.user.findUniqueOrThrow({ where: { id: referred.id } });
    assert.deepEqual([user.plan, user.subscriptionStatus], ["FREE", "CANCELED"]);

    // Outra conta paga com o mesmo CPF (mesmo cliente na Abacate Pay) e o evento vem sem externalId:
    // a conta certa sai do checkout consultado na API, e a primeira conta não é tocada.
    const other = await signUp(mail("mesmo-cpf"));
    checkoutOwners.set(`bill_9_${tag}`, other.id);
    apiPeriodEnd = new Date(Date.now() + 365 * DAY);
    await deliver(event("subscription.completed", charge(9, 11900, `subs_ext_${tag}`)));
    const linked = await prisma.user.findUniqueOrThrow({ where: { id: other.id } });
    assert.deepEqual([linked.plan, linked.abacateSubscriptionId, linked.currentPeriodEnd?.getTime()], ["PRO", `subs_ext_${tag}`, apiPeriodEnd.getTime()]);
    assert.deepEqual((await prisma.user.findUniqueOrThrow({ where: { id: referred.id } })).plan, "FREE", "a primeira conta continua como estava");

    // Pagamento sem conta correspondente falha (5xx): a Abacate Pay reenvia e o erro fica no log.
    await assert.rejects(deliver(event("subscription.completed", charge(8, 1490, `subs_orfa_${tag}`))), /sem conta correspondente/);
  } finally {
    process.env.ADMIN_EMAILS = adminsBefore;
    await prisma.billingEvent.deleteMany({ where: { createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, id: { startsWith: "log_" } } });
    await prisma.user.deleteMany({ where: { id: { in: created } } });
  }
});
