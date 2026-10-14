export function brasiliaDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/** Conta ocorrências semanais inclusivas sem depender do fuso do servidor. */
export function scheduledClassCount(since: Date, today: string, dayOfWeek: number): number {
  const start = Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate());
  const end = Date.parse(`${today}T00:00:00Z`);
  const offset = (dayOfWeek - new Date(start).getUTCDay() + 7) % 7;
  const first = start + offset * 86_400_000;
  return first > end ? 0 : Math.floor((end - first) / (7 * 86_400_000)) + 1;
}

export function scheduleAbsences(schedule: {
  attendanceSince: Date; dayOfWeek: number;
  attendances: { date: Date; attended: boolean }[];
}, today: string): number {
  const semesterEnd = new Date(schedule.attendanceSince);
  semesterEnd.setUTCDate(semesterEnd.getUTCDate() + 15 * 7 - 1);
  const end = Math.min(Date.parse(`${today}T00:00:00Z`), semesterEnd.getTime());
  const boundedToday = new Date(end).toISOString().slice(0, 10);
  const attended = schedule.attendances.filter((item) =>
    item.attended && item.date >= schedule.attendanceSince && item.date.getTime() <= end &&
    item.date.getUTCDay() === schedule.dayOfWeek,
  ).length;
  return Math.max(0, scheduledClassCount(schedule.attendanceSince, boundedToday, schedule.dayOfWeek) - attended);
}
