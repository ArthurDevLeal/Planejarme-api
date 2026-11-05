-- Pastas e compartilhamento. Aditiva: tabelas novas e uma coluna nula, nenhum dado muda.
-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "folderId" TEXT;

-- AlterTable
ALTER TABLE "Schedule" ALTER COLUMN "attendanceSince" SET DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date);

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "disciplineId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "materialId" TEXT,
    "folderId" TEXT,
    "disciplineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "materialId" TEXT,
    "folderId" TEXT,
    "disciplineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Folder_userId_idx" ON "Folder"("userId");

-- CreateIndex
CREATE INDEX "Folder_parentId_idx" ON "Folder"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_materialId_key" ON "ShareLink"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_folderId_key" ON "ShareLink"("folderId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_disciplineId_key" ON "ShareLink"("disciplineId");

-- CreateIndex
CREATE INDEX "ShareLink_ownerId_idx" ON "ShareLink"("ownerId");

-- CreateIndex
CREATE INDEX "ShareInvite_ownerId_idx" ON "ShareInvite"("ownerId");

-- CreateIndex
CREATE INDEX "ShareInvite_email_idx" ON "ShareInvite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ShareInvite_email_materialId_key" ON "ShareInvite"("email", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareInvite_email_folderId_key" ON "ShareInvite"("email", "folderId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareInvite_email_disciplineId_key" ON "ShareInvite"("email", "disciplineId");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareInvite" ADD CONSTRAINT "ShareInvite_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareInvite" ADD CONSTRAINT "ShareInvite_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareInvite" ADD CONSTRAINT "ShareInvite_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareInvite" ADD CONSTRAINT "ShareInvite_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

