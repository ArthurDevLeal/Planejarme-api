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
