-- Troca do Stripe pela Abacate Pay. Os ids do Stripe não servem na Abacate Pay: o cliente é recriado no próximo checkout.
DROP INDEX "User_stripeCustomerId_key";
ALTER TABLE "User" DROP COLUMN "stripeCustomerId",
  ADD COLUMN "abacateCustomerId" TEXT,
  ADD COLUMN "abacateSubscriptionId" TEXT;
CREATE UNIQUE INDEX "User_abacateCustomerId_key" ON "User"("abacateCustomerId");
CREATE UNIQUE INDEX "User_abacateSubscriptionId_key" ON "User"("abacateSubscriptionId");

-- Status passam a ser os daqui (ACTIVE | PAST_DUE | CANCELED); quem era Pro pelo Stripe volta ao gratuito.
UPDATE "User" SET "plan" = 'FREE', "subscriptionStatus" = NULL, "currentPeriodEnd" = NULL WHERE "subscriptionStatus" IS NOT NULL OR "plan" <> 'FREE';

ALTER TABLE "StripeEvent" RENAME TO "BillingEvent";
ALTER TABLE "BillingEvent" RENAME CONSTRAINT "StripeEvent_pkey" TO "BillingEvent_pkey";

-- Comissões antigas guardam o id da fatura do Stripe como paymentId (histórico).
ALTER TABLE "Commission" RENAME COLUMN "stripeInvoiceId" TO "paymentId";
ALTER INDEX "Commission_stripeInvoiceId_key" RENAME TO "Commission_paymentId_key";
ALTER TABLE "Commission" ADD COLUMN "checkoutId" TEXT;
CREATE INDEX "Commission_checkoutId_idx" ON "Commission"("checkoutId");
