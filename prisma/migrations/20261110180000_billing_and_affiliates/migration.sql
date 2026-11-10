-- Fase 5: plano/assinatura (Stripe) e programa de afiliados. Aditiva; todos os usuários existentes ficam FREE.
ALTER TABLE "User"
  ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'FREE',
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "subscriptionStatus" TEXT,
  ADD COLUMN "currentPeriodEnd" TIMESTAMP(3),
  ADD COLUMN "referralCode" TEXT,
  ADD COLUMN "referredById" TEXT,
  ADD COLUMN "affiliateStatus" TEXT,
  ADD COLUMN "affiliateBlockedAt" TIMESTAMP(3),
  ADD COLUMN "affiliateBlockReason" TEXT;

CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "referredUserId" TEXT,
    "stripeInvoiceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Commission_stripeInvoiceId_key" ON "Commission"("stripeInvoiceId");
CREATE INDEX "Commission_affiliateId_status_idx" ON "Commission"("affiliateId", "status");
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AffiliateEvent" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "adminEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AffiliateEvent_affiliateId_idx" ON "AffiliateEvent"("affiliateId");
ALTER TABLE "AffiliateEvent" ADD CONSTRAINT "AffiliateEvent_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
