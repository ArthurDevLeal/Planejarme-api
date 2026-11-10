// Cria o produto "Planejar.me Pro" e os preços mensal e anual no Stripe, em modo de TESTE.
// Uso: npm run stripe:setup   (lê STRIPE_SECRET_KEY do .env; recusa chave live)
// Roda quantas vezes quiser: reaproveita o que já existe pelo lookup_key.
import "dotenv/config";
import Stripe from "stripe";

// Mesmos valores de src/config/billing.ts (PRO_PRICES). Mudou lá, mude aqui e rode de novo com outro lookup_key.
const PRICES = [
  { env: "STRIPE_PRICE_PRO_MONTHLY", lookupKey: "planejarme_pro_monthly", cents: 1490, interval: "month" },
  { env: "STRIPE_PRICE_PRO_YEARLY", lookupKey: "planejarme_pro_yearly", cents: 11900, interval: "year" },
];

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
  console.error("STRIPE_SECRET_KEY precisa ser uma chave de TESTE (sk_test_...). Nada foi criado.");
  process.exit(1);
}
const stripe = new Stripe(key);

const existing = await stripe.prices.list({ lookup_keys: PRICES.map((price) => price.lookupKey), limit: 10 });
let productId = existing.data[0]?.product;
if (typeof productId !== "string") {
  productId = (await stripe.products.create({ name: "Planejar.me Pro", description: "5 GB de armazenamento, arquivos de até 50 MB e disciplinas ilimitadas." })).id;
}

console.log("\nCole no .env da API:\n");
for (const price of PRICES) {
  const found = existing.data.find((item) => item.lookup_key === price.lookupKey);
  const id = found?.id ?? (await stripe.prices.create({
    product: productId,
    currency: "brl",
    unit_amount: price.cents,
    recurring: { interval: price.interval },
    lookup_key: price.lookupKey,
  })).id;
  console.log(`${price.env}=${id}`);
}
console.log("\nDepois: stripe listen --forward-to localhost:3001/webhooks/stripe  (o comando mostra o STRIPE_WEBHOOK_SECRET)");
