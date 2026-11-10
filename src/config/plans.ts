// Única fonte dos limites por plano. Valores provisórios: ajuste aqui e em nenhum outro lugar.
const MB = 1024 * 1024;

export const PLANS = {
  FREE: { storageBytes: 200 * MB, maxFileBytes: 10 * MB, maxDisciplinesPerSemester: 5 as number | null },
  PRO: { storageBytes: 5 * 1024 * MB, maxFileBytes: 50 * MB, maxDisciplinesPerSemester: null as number | null },
};

export type PlanId = keyof typeof PLANS;

// A Fase 5 passa a ler User.plan; até lá todo usuário é FREE.
export async function planOf(_userId: string): Promise<PlanId> {
  return "FREE";
}
