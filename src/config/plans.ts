// Única fonte dos limites por plano. Valores provisórios: ajuste aqui e em nenhum outro lugar.
import { prisma } from "../../lib/prisma.ts";

const MB = 1024 * 1024;

export const PLANS = {
  // Arquivos são só do Pro (ProOnlyWrites); zero aqui faz as telas não prometerem espaço no gratuito.
  // quizzesPerMonth: simulados com IA. 15 é chute inicial; ajustar pelo custo real (Quiz.inputTokens/outputTokens).
  FREE: { storageBytes: 0, maxFileBytes: 0, maxDisciplinesPerSemester: 5 as number | null, quizzesPerMonth: 2, flashcardDecksPerMonth: 1 },
  PRO: { storageBytes: 5 * 1024 * MB, maxFileBytes: 50 * MB, maxDisciplinesPerSemester: null as number | null, quizzesPerMonth: 15, flashcardDecksPerMonth: 20 },
};

export type PlanId = keyof typeof PLANS;

/** Dias de Pro grátis para conta nova. */
export const TRIAL_DAYS = 7;

/** Pago (User.plan, mantido pelo webhook da Abacate Pay) ou em teste grátis. Qualquer valor desconhecido vale FREE. */
export function effectivePlan({ plan, trialEndsAt }: { plan: string; trialEndsAt: Date | null }, now = new Date()): PlanId {
  return plan === "PRO" || (trialEndsAt !== null && trialEndsAt > now) ? "PRO" : "FREE";
}

export async function planOf(userId: string): Promise<PlanId> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, trialEndsAt: true } });
  return user ? effectivePlan(user) : "FREE";
}
