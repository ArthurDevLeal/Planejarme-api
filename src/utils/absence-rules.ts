/**
 * Regras de Negócio — Módulo de Frequência e Presença
 *
 * RN01 — Limite Máximo de Faltas:
 * O limite de faltas é calculado com base na percentagem mínima exigida
 * (padrão: 25% de faltas sobre a carga horária total), salvo se configurado customizadamente.
 *
 * RN02 — Níveis de Alerta (Status de Risco):
 * 🟢 Verde (Normal): Faltas acumuladas abaixo de 60% do limite.
 * 🟡 Amarelo (Atenção): Faltas acumuladas entre 60% e 89% do limite.
 * 🔴 Vermelho (Crítico): Faltas acumuladas em 90% ou mais do limite (ou aluno reprovado por falta).
 *
 * RN03 — Incremento e Decremento de Faltas:
 * O acionamento de "Faltei" registra 1 falta na disciplina referente à data/hora atual.
 * O sistema deve permitir a reversão (desfazer falta) até o final do período letivo corrente.
 *
 * RN04 — Trava de Carga Horária Excedida:
 * O número acumulado de faltas registradas em uma disciplina não pode ultrapassar a sua
 * Carga Horária Total em horas/aulas.
 */

export type AbsenceRiskLevel = "normal" | "attention" | "critical";

export function calculateAbsenceLimit(workloadHours: number, maxAbsencePct = 25): number {
  if (!Number.isFinite(workloadHours) || workloadHours <= 0) return 0;
  const pct = Number.isFinite(maxAbsencePct) && maxAbsencePct >= 0 ? maxAbsencePct : 25;
  return Math.floor(workloadHours * (pct / 100));
}

export function calculateAbsenceRisk(absences: number, limit: number): {
  status: AbsenceRiskLevel;
  percentage: number;
  label: string;
} {
  const safeAbsences = Math.max(0, Number.isFinite(absences) ? absences : 0);
  const safeLimit = Math.max(0, Number.isFinite(limit) ? limit : 0);

  if (safeLimit === 0) {
    if (safeAbsences > 0) {
      return { status: "critical", percentage: 100, label: "Reprovado por falta" };
    }
    return { status: "normal", percentage: 0, label: "Normal" };
  }

  const percentage = (safeAbsences / safeLimit) * 100;
  if (safeAbsences > safeLimit) {
    return { status: "critical", percentage, label: "Reprovado por falta" };
  }
  if (percentage >= 90) {
    return { status: "critical", percentage, label: "Crítico" };
  }
  if (percentage >= 60) {
    return { status: "attention", percentage, label: "Atenção" };
  }
  return { status: "normal", percentage, label: "Normal" };
}

export function validateAbsenceWorkloadCeiling(absences: number, workloadHours: number): boolean {
  if (absences < 0) return false;
  return absences <= workloadHours;
}
