// Cria os produtos de assinatura "Planejar.me Pro" (mensal e anual) na Abacate Pay, em Dev mode.
// Uso: npm run abacatepay:setup   (lê ABACATEPAY_API_KEY do .env; recusa chave de produção)
// Roda quantas vezes quiser: reaproveita o que já existe pelo externalId.
import "dotenv/config";

// Mesmos valores de src/config/billing.ts (PRO_PRICES). Mudou lá, mude aqui e rode de novo com outro externalId.
const PRODUCTS = [
  { env: "ABACATEPAY_PRODUCT_PRO_MONTHLY", externalId: "planejarme-pro-monthly", name: "Planejar.me Pro (mensal)", cents: 1490, cycle: "MONTHLY" },
  { env: "ABACATEPAY_PRODUCT_PRO_YEARLY", externalId: "planejarme-pro-yearly", name: "Planejar.me Pro (anual)", cents: 11900, cycle: "ANNUALLY" },
];

const key = process.env.ABACATEPAY_API_KEY ?? "";
if (!key.startsWith("abc_dev_")) {
  console.error("ABACATEPAY_API_KEY precisa ser uma chave de Dev mode (abc_dev_...). Nada foi criado.");
  process.exit(1);
}

async function api(path, body) {
  const response = await fetch(`https://api.abacatepay.com/v2${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  if (!response.ok || !json.success) throw new Error(`${path}: ${json.error ?? response.status}`);
  return json.data;
}

const existing = await api("/products/list");
console.log("\nCole no .env da API:\n");
for (const product of PRODUCTS) {
  const found = existing.find((item) => item.externalId === product.externalId);
  const id = found?.id ?? (await api("/products/create", {
    externalId: product.externalId,
    name: product.name,
    description: "5 GB de armazenamento, arquivos de até 50 MB e disciplinas ilimitadas.",
    price: product.cents,
    currency: "BRL",
    cycle: product.cycle,
  })).id;
  console.log(`${product.env}=${id}`);
}
console.log("\nWebhook: precisa de URL HTTPS pública (veja ABACATEPAY-GO-LIVE.md na raiz do monorepo).");
