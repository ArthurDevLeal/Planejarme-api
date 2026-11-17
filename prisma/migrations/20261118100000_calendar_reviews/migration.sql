-- AlterTable
ALTER TABLE "User" ADD COLUMN "calendarToken" TEXT;

-- CreateTable
CREATE TABLE "ReviewCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewCheck_userId_day_idx" ON "ReviewCheck"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCheck_evaluationId_day_key" ON "ReviewCheck"("evaluationId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "User_calendarToken_key" ON "User"("calendarToken");

-- AddForeignKey
ALTER TABLE "ReviewCheck" ADD CONSTRAINT "ReviewCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCheck" ADD CONSTRAINT "ReviewCheck_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
