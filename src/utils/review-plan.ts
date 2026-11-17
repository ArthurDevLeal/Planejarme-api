const DAY_MS = 86_400_000;

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

const REVIEW_OFFSETS = [7, 3, 1];

/** Dias de revisão (D-7, D-3, D-1) da prova que ainda não passaram. YYYY-MM-DD de Brasília compara como texto. */
export function reviewDays(evaluationDay: string, today: string): string[] {
  return REVIEW_OFFSETS.map((o) => addDays(evaluationDay, -o)).filter((d) => d >= today);
}
