-- RN09: política de arredondamento das notas do usuário (aditiva, com default; não afeta dados existentes).
ALTER TABLE "User" ADD COLUMN "roundingMode" TEXT NOT NULL DEFAULT 'NEAREST';
