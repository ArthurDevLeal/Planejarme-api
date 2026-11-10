// Única fonte dos limites por plano. Valores provisórios: ajuste aqui e em nenhum outro lugar.
import { prisma } from "../../lib/prisma.ts";

const MB = 1024 * 1024;

export const PLANS = {
  FREE: { storageBytes: 200 * MB, maxFileBytes: 10 * MB, maxDisciplinesPerSemester: 5 as number | null },
  PRO: { storageBytes: 5 * 1024 * MB, maxFileBytes: 50 * MB, maxDisciplinesPerSemester: null as number | null },
};

export type PlanId = keyof typeof PLANS;

/** O plano vem de User.plan, que o webhook da Abacate Pay mantém. Qualquer valor desconhecido vale FREE. */
export async function planOf(userId: string): Promise<PlanId> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  return user?.plan === "PRO" ? "PRO" : "FREE";
}
