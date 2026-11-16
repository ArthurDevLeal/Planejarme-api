-- Estudos: regra de aprovação por disciplina, avaliação FINAL, avisos de risco por e-mail, link da turma, simulado com IA. Aditiva: nulos e padrões mantêm o comportamento atual.
-- AlterTable
ALTER TABLE "Discipline" ADD COLUMN     "finalExamWeight" DOUBLE PRECISION,
ADD COLUMN     "finalMinAverage" DOUBLE PRECISION,
ADD COLUMN     "finalPassingScore" DOUBLE PRECISION,
ADD COLUMN     "hasFinalExam" BOOLEAN,
ADD COLUMN     "importedFromTemplateId" TEXT,
ADD COLUMN     "maxAbsencePct" DOUBLE PRECISION,
ADD COLUMN     "passingScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Evaluation" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'REGULAR';

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "textContent" TEXT,
ADD COLUMN     "textExtractedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "riskEmails" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ClassTemplate" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "importCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "evaluationId" TEXT,
    "materialIds" TEXT[],
    "questions" JSONB NOT NULL,
    "answers" JSONB,
    "score" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassTemplate_token_key" ON "ClassTemplate"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ClassTemplate_disciplineId_key" ON "ClassTemplate"("disciplineId");

-- CreateIndex
CREATE INDEX "ClassTemplate_ownerId_idx" ON "ClassTemplate"("ownerId");

-- CreateIndex
CREATE INDEX "Quiz_userId_createdAt_idx" ON "Quiz"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Quiz_disciplineId_idx" ON "Quiz"("disciplineId");

-- AddForeignKey
ALTER TABLE "ClassTemplate" ADD CONSTRAINT "ClassTemplate_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTemplate" ADD CONSTRAINT "ClassTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

