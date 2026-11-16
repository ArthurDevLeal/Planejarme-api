import { prisma } from "../../lib/prisma.ts";
import {
  attendanceWindowEnd,
  brasiliaDate,
  courseWindow,
  effectiveAttendanceStart,
  scheduleAbsences,
  scheduledClassCount,
} from "../utils/academic-date.ts";
import { STATUS_USER_SELECT, statusForDiscipline } from "./discipline-status-service.ts";

const DAY_MS = 86_400_000;
const WRAPPED_DAYS_BEFORE_END = 14;
const MIN_FACTS = 3;

/** Retrospectiva do semestre, calculada na hora e só com dados reais. null se o semestre não existe. */
export async function GetSemesterWrappedService(semesterId: string, now = new Date()) {
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    include: {
      user: { select: STATUS_USER_SELECT },
      disciplines: { include: { evaluations: true, schedules: { include: { attendances: true } }, classTemplate: { select: { importCount: true } } } },
    },
  });
  if (!semester) return null;

  const today = brasiliaDate(now);
  const window = courseWindow(semester);
  const windowEnd = new Date(semester.endDate.getTime() + DAY_MS);
  const range = { gte: semester.startDate, lt: windowEnd };

  let held = 0;
  let missedBySchedule = 0;
  let manualAbsences = 0;
  const missedByWeekday = Array<number>(7).fill(0);
  let passedCount = 0;
  let classmatesImported = 0;
  let bestGrade: { disciplineName: string; evaluationTitle: string; score: number } | null = null;
  let biggestTurnaround: { disciplineName: string; lowestScore: number; passingScore: number } | null = null;

  for (const discipline of semester.disciplines) {
    let missedHere = 0;
    for (const schedule of discipline.schedules) {
      const start = effectiveAttendanceStart(schedule.attendanceSince, window);
      const end = attendanceWindowEnd(schedule.attendanceSince, today, window);
      if (end >= start.getTime()) held += scheduledClassCount(start, new Date(end).toISOString().slice(0, 10), schedule.dayOfWeek);
      const missed = scheduleAbsences(schedule, today, window);
      missedHere += missed;
      missedByWeekday[schedule.dayOfWeek] += missed;
    }
    missedBySchedule += missedHere;
    manualAbsences += discipline.absences;
    classmatesImported += discipline.classTemplate?.importCount ?? 0;

    const absences = Math.min(discipline.workloadHours, discipline.absences + missedHere);
    const status = statusForDiscipline(discipline, absences, semester.user, today);
    if (status.verdict === "PASSED") passedCount++;

    const graded = discipline.evaluations.filter((item) => item.score !== null);
    for (const evaluation of graded) {
      if (!bestGrade || (evaluation.score as number) > bestGrade.score) {
        bestGrade = { disciplineName: discipline.name, evaluationTitle: evaluation.title, score: evaluation.score as number };
      }
    }
    // Virada (versão simples): está aprovada ou segura hoje e teve alguma nota abaixo da média de aprovação. Ganha a maior distância.
    if (status.verdict === "PASSED" || status.verdict === "SAFE") {
      const lowest = Math.min(...graded.map((item) => item.score as number));
      const passing = status.rule.passingScore;
      if (lowest < passing && (!biggestTurnaround || passing - lowest > biggestTurnaround.passingScore - biggestTurnaround.lowestScore)) {
        biggestTurnaround = { disciplineName: discipline.name, lowestScore: lowest, passingScore: passing };
      }
    }
  }

  const [tasksCompleted, quizzes] = await Promise.all([
    prisma.task.count({ where: { userId: semester.userId, status: "COMPLETED", deletedAt: null, completedAt: range } }),
    prisma.quiz.aggregate({ where: { userId: semester.userId, status: "DONE", createdAt: range }, _count: true, _avg: { score: true } }),
  ]);

  // Faltas manuais não têm data: entram no denominador, sem dia da semana.
  const attendancePct = held > 0 ? Math.round((Math.max(0, held - missedBySchedule) / (held + manualAbsences)) * 100) : null;
  const topDay = missedByWeekday.reduce((best, count, day) => (count > missedByWeekday[best] ? day : best), 0);
  const mostMissedWeekday = missedByWeekday[topDay] > 0 ? { dayOfWeek: topDay, count: missedByWeekday[topDay] } : null;
  const quizzesDone = quizzes._count;
  const quizAverage = quizzesDone && quizzes._avg.score !== null ? Math.round(quizzes._avg.score * 100) / 100 : null;
  const daysToEnd = Math.round((Date.parse(`${semester.endDate.toISOString().slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);

  // Contagens zeradas não contam como fato para liberar o Wrapped.
  const facts = [attendancePct, bestGrade, biggestTurnaround, mostMissedWeekday, quizAverage, passedCount || null, tasksCompleted || null, classmatesImported || null];
  const factCount = facts.filter((fact) => fact !== null).length;

  return {
    semesterName: semester.name,
    attendancePct,
    disciplineCount: semester.disciplines.length,
    passedCount,
    bestGrade,
    biggestTurnaround,
    mostMissedWeekday,
    tasksCompleted,
    quizzesDone,
    quizAverage,
    classmatesImported,
    daysToEnd,
    available: daysToEnd <= WRAPPED_DAYS_BEFORE_END && factCount >= MIN_FACTS,
  };
}
