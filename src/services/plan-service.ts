import { prisma } from "../../lib/prisma.ts";
import { PLANS, planOf } from "../config/plans.ts";
import { ForbiddenException } from "../exceptions/forbidden.ts";
import { ErrorCode } from "../exceptions/root.ts";

const formatMb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;
const limitReached = (message: string) => new ForbiddenException(message, ErrorCode.PLAN_LIMIT_REACHED);

/** Cada objeto do Storage conta uma vez, mesmo com várias linhas apontando para ele (arquivo repetido). A lixeira conta até ser esvaziada. */
export async function GetUsageService(userId: string) {
  const plan = await planOf(userId);
  const [row] = await prisma.$queryRaw<{ used: number; saved: number }[]>`
    SELECT COALESCE(SUM(final + thumbnail), 0)::float8 AS used,
           COALESCE(SUM(GREATEST(original - final, 0)), 0)::float8 AS saved
    FROM (
      SELECT DISTINCT ON ("storagePath")
        COALESCE("sizeBytes", 0) AS final,
        COALESCE("thumbnailBytes", 0) AS thumbnail,
        COALESCE("originalSizeBytes", "sizeBytes", 0) AS original
      FROM "Material"
      WHERE "userId" = ${userId} AND "storagePath" IS NOT NULL
    ) objects`;
  const limits = PLANS[plan];
  return {
    plan,
    usedBytes: row?.used ?? 0,
    limitBytes: limits.storageBytes,
    savedBytes: row?.saved ?? 0,
    maxFileBytes: limits.maxFileBytes,
    maxDisciplinesPerSemester: limits.maxDisciplinesPerSemester,
  };
}

export async function assertFileSize(userId: string, sizeBytes: number) {
  const { maxFileBytes } = PLANS[await planOf(userId)];
  if (sizeBytes > maxFileBytes) {
    throw limitReached(`Este arquivo passa do limite de ${formatMb(maxFileBytes)} por arquivo do seu plano. Faça upgrade para enviar arquivos maiores.`);
  }
}

/** Quem já passou do limite não perde nada: só não envia até liberar espaço ou assinar. */
export async function assertStorageRoom(userId: string, extraBytes: number) {
  const usage = await GetUsageService(userId);
  if (usage.usedBytes + extraBytes > usage.limitBytes) {
    throw limitReached(
      `Você atingiu o limite de ${formatMb(usage.limitBytes)} de armazenamento do seu plano. Esvazie a lixeira ou apague arquivos para liberar espaço, ou faça upgrade.`,
    );
  }
}

export async function assertDisciplineSlots(userId: string, semesterId: string, adding = 1) {
  const limit = PLANS[await planOf(userId)].maxDisciplinesPerSemester;
  if (limit === null) return;
  const current = await prisma.discipline.count({ where: { userId, semesterId } });
  if (current + adding > limit) {
    throw limitReached(`Seu plano permite até ${limit} disciplinas por semestre. Faça upgrade para cadastrar mais.`);
  }
}
