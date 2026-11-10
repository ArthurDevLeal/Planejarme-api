-- Fase 1 (armazenamento): tamanho em bytes, hash para deduplicar, miniatura e fila de limpeza. Aditiva.
ALTER TABLE "Material"
  ADD COLUMN "sizeBytes" INTEGER,
  ADD COLUMN "originalSizeBytes" INTEGER,
  ADD COLUMN "sha256" TEXT,
  ADD COLUMN "thumbnailPath" TEXT,
  ADD COLUMN "thumbnailBytes" INTEGER;

-- Arquivos já enviados: o tamanho conhecido vira bytes (original = final, não houve compressão).
UPDATE "Material"
SET "sizeBytes" = ROUND("fileSizeMb" * 1048576)::INTEGER,
    "originalSizeBytes" = ROUND("fileSizeMb" * 1048576)::INTEGER
WHERE "storagePath" IS NOT NULL AND "fileSizeMb" IS NOT NULL;

-- Materiais antigos sem dono herdam o da disciplina: cota e lixeira passam a olhar só para userId.
UPDATE "Material" m
SET "userId" = d."userId"
FROM "Discipline" d
WHERE m."userId" IS NULL AND m."disciplineId" = d."id";

CREATE INDEX "Material_userId_sha256_idx" ON "Material"("userId", "sha256");
CREATE INDEX "Material_storagePath_idx" ON "Material"("storagePath");

CREATE TABLE "StorageDeletion" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageDeletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorageDeletion_path_key" ON "StorageDeletion"("path");
