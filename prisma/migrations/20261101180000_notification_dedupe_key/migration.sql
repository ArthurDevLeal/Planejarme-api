-- RF17: chave para não repetir alertas automáticos. Aditiva; avisos existentes ficam com NULL (não conflitam).
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");
