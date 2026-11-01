export function brasiliaDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

const DAY_MS = 86_400_000;
const FALLBACK_WEEKS = 15;

/** Período letivo do semestre em datas `YYYY-MM-DD` (fuso de Brasília). */
export type SemesterWindow = {
  startDate?: string | null;
  endDate?: string | null;
};

type SemesterDates = { startDate: Date | null; endDate: Date | null };

/** Converte as datas do semestre no período usado pela contagem de aulas. */
export function courseWindow(semester?: SemesterDates | null): SemesterWindow | undefined {
  if (!semester?.startDate || !semester?.endDate) return undefined;
  return {
    startDate: semester.startDate.toISOString().slice(0, 10),
    endDate: semester.endDate.toISOString().slice(0, 10),
  };
}

function toStartOfDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Início efetivo da contagem de aulas: a data mais tardia entre o início do
 * semestre e o marco do horário (`attendanceSince`), para não gerar faltas
 * retroativas em horários cadastrados depois do início do período.
 */
export function effectiveAttendanceStart(
  attendanceSince: Date,
  window?: SemesterWindow,
): Date {
  const start = toStartOfDay(attendanceSince);
  const semesterStart = window?.startDate
    ? Date.parse(`${window.startDate}T00:00:00Z`)
    : Number.NaN;
  if (Number.isNaN(semesterStart) || semesterStart <= start) return new Date(start);
  return new Date(semesterStart);
}

/**
 * Último dia contabilizado do período letivo. Com `endDate` do semestre, a
 * contagem termina nessa data; sem ele, mantém o teto antigo de 15 semanas.
 */
export function attendanceWindowEnd(
  attendanceSince: Date,
  today: string,
  window?: SemesterWindow,
): number {
  const start = effectiveAttendanceStart(attendanceSince, window);
  const semesterEnd = window?.endDate ? Date.parse(`${window.endDate}T00:00:00Z`) : Number.NaN;
  const limit = Number.isNaN(semesterEnd)
    ? start.getTime() + FALLBACK_WEEKS * 7 * DAY_MS - DAY_MS
    : semesterEnd;
  return Math.min(Date.parse(`${today}T00:00:00Z`), limit);
}

/** Conta ocorrências semanais inclusivas sem depender do fuso do servidor. */
export function scheduledClassCount(since: Date, today: string, dayOfWeek: number): number {
  const start = Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate());
  const end = Date.parse(`${today}T00:00:00Z`);
  const offset = (dayOfWeek - new Date(start).getUTCDay() + 7) % 7;
  const first = start + offset * DAY_MS;
  return first > end ? 0 : Math.floor((end - first) / (7 * DAY_MS)) + 1;
}

export function scheduleAbsences(schedule: {
  attendanceSince: Date; dayOfWeek: number;
  attendances: { date: Date; attended: boolean }[];
}, today: string, window?: SemesterWindow): number {
  const start = effectiveAttendanceStart(schedule.attendanceSince, window);
  const end = attendanceWindowEnd(schedule.attendanceSince, today, window);
  if (end < start.getTime()) return 0;
  const boundedToday = new Date(end).toISOString().slice(0, 10);
  const attended = schedule.attendances.filter((item) =>
    item.attended && item.date.getTime() >= start.getTime() && item.date.getTime() <= end &&
    item.date.getUTCDay() === schedule.dayOfWeek,
  ).length;
  return Math.max(0, scheduledClassCount(start, boundedToday, schedule.dayOfWeek) - attended);
}
