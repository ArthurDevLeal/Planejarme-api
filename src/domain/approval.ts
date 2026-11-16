// Regra de aprovação e situação de uma disciplina ("nunca reprove").
// Funções puras, sem imports: este arquivo é copiado IGUAL em planejarme-web/lib/approval.ts.
// Ao mudar aqui, copie para lá; os dois repos rodam tests/approval-cases.json para não divergirem.

export type GradingSystem = "ARITHMETIC" | "WEIGHTED";
export type RoundingMode = "NEAREST" | "UP" | "DOWN";

export type Verdict =
  | "NO_DATA"
  | "PASSED"
  | "SAFE"
  | "ATTENTION"
  | "FINAL"
  | "RISK"
  | "FAILED_GRADE"
  | "FAILED_ABSENCE";

/** Quanto pior, maior. A situação da disciplina é a pior entre nota e falta. */
export const VERDICT_SEVERITY: Record<Verdict, number> = {
  NO_DATA: 0,
  PASSED: 1,
  SAFE: 2,
  ATTENTION: 3,
  FINAL: 4,
  RISK: 5,
  FAILED_GRADE: 6,
  FAILED_ABSENCE: 7,
};

/** Precisar de mais que isto na próxima prova é risco. */
export const RISK_NEEDED_GRADE = 8;
/** Poder faltar só isto ou menos é risco. */
export const RISK_ABSENCES_LEFT = 1;
/** Ter gastado 75% do limite de faltas é atenção. */
export const ATTENTION_ABSENCE_SHARE = 0.75;

export interface RuleFields {
  gradingSystem?: string | null;
  passingScore?: number | null;
  maxAbsencePct?: number | null;
  hasFinalExam?: boolean | null;
  finalMinAverage?: number | null;
  finalPassingScore?: number | null;
  finalExamWeight?: number | null;
}

export interface RuleDefaults {
  passingScore: number;
  maxAbsencePct: number;
}

export interface ResolvedRule {
  gradingSystem: GradingSystem;
  passingScore: number;
  maxAbsencePct: number;
  hasFinalExam: boolean;
  finalMinAverage: number | null;
  finalPassingScore: number;
  finalExamWeight: number;
  /** Campos que vieram do padrão do usuário (a disciplina deixou nulo). */
  inherited: { passingScore: boolean; maxAbsencePct: boolean };
}

export interface EvaluationInput {
  id: string;
  title: string;
  weight: number;
  score: number | null;
  /** YYYY-MM-DD */
  date: string;
  kind?: string | null;
}

export interface StatusInput {
  evaluations: EvaluationInput[];
  absencesUsed: number;
  workloadHours: number;
  rule: ResolvedRule;
  /** YYYY-MM-DD, hoje em Brasília. */
  today: string;
}

export interface NeededOnNext {
  evaluationId: string;
  title: string;
  date: string;
  needed: number;
}

export interface DisciplineStatus {
  average: number | null;
  neededOnNext: NeededOnNext | null;
  neededOnFinal: number | null;
  finalAverage: number | null;
  absencesUsed: number;
  absencesLimit: number;
  absencesLeft: number;
  gradeVerdict: Verdict;
  absenceVerdict: Verdict;
  verdict: Verdict;
  cause: "GRADE" | "ABSENCE" | null;
  reason: string;
  rule: ResolvedRule;
}

/** O que a API devolve em cada disciplina: a situação e a regra escrita em uma frase. */
export type DisciplineStatusPayload = DisciplineStatus & { ruleText: string };

const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function resolveRule(fields: RuleFields, defaults: RuleDefaults): ResolvedRule {
  const passingScore = isNum(fields.passingScore) ? fields.passingScore : defaults.passingScore;
  const maxAbsencePct = isNum(fields.maxAbsencePct) ? fields.maxAbsencePct : defaults.maxAbsencePct;
  const weight = isNum(fields.finalExamWeight) ? fields.finalExamWeight : 0.5;
  return {
    gradingSystem: fields.gradingSystem === "WEIGHTED" ? "WEIGHTED" : "ARITHMETIC",
    passingScore,
    maxAbsencePct,
    hasFinalExam: fields.hasFinalExam ?? true,
    finalMinAverage: isNum(fields.finalMinAverage) ? fields.finalMinAverage : null,
    finalPassingScore: isNum(fields.finalPassingScore) ? fields.finalPassingScore : passingScore,
    finalExamWeight: Math.min(1, Math.max(0.05, weight)),
    inherited: { passingScore: !isNum(fields.passingScore), maxAbsencePct: !isNum(fields.maxAbsencePct) },
  };
}

export function roundGrade(value: number, mode: RoundingMode = "NEAREST"): number {
  const round = mode === "UP" ? Math.ceil : mode === "DOWN" ? Math.floor : Math.round;
  return round(Number((value * 100).toFixed(6))) / 100;
}

/** "8,5" / "7" / "6,25": vírgula decimal, sem zeros sobrando. */
export function formatGradeBR(value: number, mode: RoundingMode = "NEAREST"): string {
  return String(roundGrade(value, mode)).replace(".", ",");
}

export function absenceLimit(workloadHours: number, maxAbsencePct: number): number {
  if (!isNum(workloadHours) || workloadHours <= 0) return 0;
  const pct = isNum(maxAbsencePct) && maxAbsencePct >= 0 ? maxAbsencePct : 25;
  return Math.floor(workloadHours * (pct / 100));
}

/** Média das avaliações com nota. Aritmética ignora o peso. */
export function currentAverage(evaluations: EvaluationInput[], system: GradingSystem): number | null {
  const graded = evaluations.filter((item) => isNum(item.score));
  if (graded.length === 0) return null;
  if (system === "ARITHMETIC") {
    return graded.reduce((acc, item) => acc + (item.score as number), 0) / graded.length;
  }
  const totalWeight = graded.reduce((acc, item) => acc + Math.max(0, item.weight), 0);
  if (totalWeight <= 0) return null;
  return graded.reduce((acc, item) => acc + (item.score as number) * Math.max(0, item.weight), 0) / totalWeight;
}

/**
 * Nota que falta em cada avaliação pendente para fechar a média de aprovação.
 * Aritmética: divide igualmente. Ponderada: mesma nota em todas as pendentes, pesada pelo peso.
 * null quando não dá para calcular (sem pendentes ou pesos zerados).
 */
export function neededPerPending(evaluations: EvaluationInput[], system: GradingSystem, target: number): number | null {
  const pending = evaluations.filter((item) => !isNum(item.score));
  if (pending.length === 0) return null;
  const graded = evaluations.filter((item) => isNum(item.score));
  if (system === "ARITHMETIC") {
    const gradedSum = graded.reduce((acc, item) => acc + (item.score as number), 0);
    return (target * evaluations.length - gradedSum) / pending.length;
  }
  const totalWeight = evaluations.reduce((acc, item) => acc + Math.max(0, item.weight), 0);
  const pendingWeight = pending.reduce((acc, item) => acc + Math.max(0, item.weight), 0);
  if (totalWeight <= 0 || pendingWeight <= 0) return null;
  const gradedWeighted = graded.reduce((acc, item) => acc + (item.score as number) * Math.max(0, item.weight), 0);
  return (target * totalWeight - gradedWeighted) / pendingWeight;
}

/** Nota da final para a média final chegar a finalPassingScore. */
export function neededOnFinalExam(average: number, rule: ResolvedRule): number {
  const w = rule.finalExamWeight;
  return (rule.finalPassingScore - average * (1 - w)) / w;
}

export function finalExamAverage(average: number, finalScore: number, rule: ResolvedRule): number {
  const w = rule.finalExamWeight;
  return average * (1 - w) + finalScore * w;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function whenLabel(today: string, date: string): string {
  const days = daysBetween(today, date);
  if (days < 0) return "";
  if (days === 0) return " (hoje)";
  if (days === 1) return " (amanhã)";
  return ` (em ${days} dias)`;
}

const classes = (n: number) => `${n} ${n === 1 ? "aula" : "aulas"}`;

/** Regra em uma frase, para o aluno conferir com o plano de ensino. */
export function describeRule(rule: ResolvedRule, workloadHours: number): string {
  const limit = absenceLimit(workloadHours, rule.maxAbsencePct);
  const pass = formatGradeBR(rule.passingScore);
  const absences = `até ${formatGradeBR(rule.maxAbsencePct)}% de faltas (${classes(limit)})`;
  const system = rule.gradingSystem === "WEIGHTED" ? "ponderada" : "simples";
  const head = `Aprova com média ${system} ${pass} e ${absences}.`;
  if (!rule.hasFinalExam) return `${head} Não tem prova final.`;
  const range = rule.finalMinAverage !== null ? `Entre ${formatGradeBR(rule.finalMinAverage)} e ${pass}` : `Abaixo de ${pass}`;
  const formula =
    rule.finalExamWeight >= 1
      ? `a nota da final substitui a média e passa com ${formatGradeBR(rule.finalPassingScore)}`
      : rule.finalExamWeight === 0.5
        ? `passa se (média + final) / 2 ≥ ${formatGradeBR(rule.finalPassingScore)}`
        : `a final vale ${formatGradeBR(rule.finalExamWeight * 100)}% da média final e passa com ${formatGradeBR(rule.finalPassingScore)}`;
  return `${head} ${range}, faz a final, e ${formula}.`;
}

function absenceSituation(used: number, limit: number): { verdict: Verdict; reason: string } {
  const left = limit - used;
  if (used > limit) return { verdict: "FAILED_ABSENCE", reason: `Passou do limite de faltas (${used} de ${limit}).` };
  if (limit <= 0) return { verdict: "SAFE", reason: "Sem limite de faltas cadastrado." };
  if (left === 0) return { verdict: "RISK", reason: "Não pode faltar mais nenhuma aula." };
  if (left <= RISK_ABSENCES_LEFT) return { verdict: "RISK", reason: `Só pode faltar mais ${classes(left)}.` };
  if (used >= limit * ATTENTION_ABSENCE_SHARE) return { verdict: "ATTENTION", reason: `Pode faltar mais ${classes(left)}.` };
  return { verdict: "SAFE", reason: `Pode faltar mais ${classes(left)}.` };
}

export function computeStatus(input: StatusInput, mode: RoundingMode = "NEAREST"): DisciplineStatus {
  const { rule, today } = input;
  const regular = input.evaluations.filter((item) => item.kind !== "FINAL");
  const finalExam = input.evaluations.find((item) => item.kind === "FINAL") ?? null;
  const used = Math.max(0, isNum(input.absencesUsed) ? input.absencesUsed : 0);
  const limit = absenceLimit(input.workloadHours, rule.maxAbsencePct);
  const absence = absenceSituation(used, limit);

  const average = currentAverage(regular, rule.gradingSystem);
  let gradeVerdict: Verdict = "NO_DATA";
  let gradeReason = "Cadastre as provas para saber quanto precisa.";
  let neededOnNext: NeededOnNext | null = null;
  let neededOnFinal: number | null = null;
  let finalAverage: number | null = null;
  const fmt = (n: number) => formatGradeBR(n, mode);

  const pending = regular.filter((item) => !isNum(item.score)).sort((a, b) => a.date.localeCompare(b.date));

  const finalPath = (avg: number): void => {
    const allowed = rule.hasFinalExam && (rule.finalMinAverage === null || avg >= rule.finalMinAverage);
    if (!allowed) {
      gradeVerdict = "FAILED_GRADE";
      gradeReason = rule.hasFinalExam
        ? `Média ${fmt(avg)} ficou abaixo do mínimo para a final (${fmt(rule.finalMinAverage as number)}).`
        : `Média ${fmt(avg)} ficou abaixo de ${fmt(rule.passingScore)}.`;
      return;
    }
    neededOnFinal = Math.max(0, neededOnFinalExam(avg, rule));
    if (finalExam && isNum(finalExam.score)) {
      finalAverage = finalExamAverage(avg, finalExam.score, rule);
      const passed = finalAverage >= rule.finalPassingScore;
      gradeVerdict = passed ? "PASSED" : "FAILED_GRADE";
      gradeReason = passed ? `Aprovado na final com ${fmt(finalAverage)}.` : `Média final ${fmt(finalAverage)}, abaixo de ${fmt(rule.finalPassingScore)}.`;
      return;
    }
    if (neededOnFinal > 10) {
      gradeVerdict = "FAILED_GRADE";
      gradeReason = `Nem com 10 na final dá para passar (precisaria de ${fmt(neededOnFinal)}).`;
      return;
    }
    gradeVerdict = "FINAL";
    gradeReason = `Vai para a final: precisa de ${fmt(neededOnFinal)}${finalExam ? whenLabel(today, finalExam.date) : ""}.`;
  };

  if (regular.length > 0 && pending.length === 0 && average !== null) {
    if (average >= rule.passingScore) {
      gradeVerdict = "PASSED";
      gradeReason = `Aprovado com ${fmt(average)}.`;
    } else {
      finalPath(average);
    }
  } else if (pending.length > 0) {
    const needed = neededPerPending(regular, rule.gradingSystem, rule.passingScore);
    const next = pending[0];
    if (needed === null) {
      gradeVerdict = "NO_DATA";
      gradeReason = "Defina os pesos das avaliações.";
    } else if (needed <= 0) {
      gradeVerdict = "PASSED";
      gradeReason = "Aprovação garantida, mesmo com zero no que falta.";
    } else {
      neededOnNext = { evaluationId: next.id, title: next.title, date: next.date, needed };
      const many = pending.length > 1 ? ` (média nas ${pending.length} que faltam)` : "";
      if (needed > 10) {
        if (rule.hasFinalExam) {
          gradeVerdict = "RISK";
          gradeReason = "Não dá mais para passar direto; o caminho agora é a final.";
        } else {
          gradeVerdict = "FAILED_GRADE";
          gradeReason = `Precisaria de ${fmt(needed)} e não há prova final.`;
        }
      } else {
        gradeVerdict = needed > RISK_NEEDED_GRADE ? "RISK" : needed > rule.passingScore ? "ATTENTION" : "SAFE";
        gradeReason = `Precisa de ${fmt(needed)} na ${next.title}${whenLabel(today, next.date)}${many}.`;
      }
    }
  }

  const absenceWorse = VERDICT_SEVERITY[absence.verdict] > VERDICT_SEVERITY[gradeVerdict];
  // Falta só manda quando é pior que a nota; "SAFE" de falta não esconde "NO_DATA" de nota.
  const useAbsence = absenceWorse && absence.verdict !== "SAFE";
  const verdict = useAbsence ? absence.verdict : gradeVerdict;

  return {
    average,
    neededOnNext,
    neededOnFinal,
    finalAverage,
    absencesUsed: used,
    absencesLimit: limit,
    absencesLeft: limit - used,
    gradeVerdict,
    absenceVerdict: absence.verdict,
    verdict,
    cause: verdict === "NO_DATA" ? null : useAbsence ? "ABSENCE" : "GRADE",
    reason: useAbsence ? absence.reason : gradeReason,
    rule,
  };
}
