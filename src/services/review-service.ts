import { prisma } from "../../lib/prisma.ts";
import { planOf } from "../config/plans.ts";
import { ForbiddenException } from "../exceptions/forbidden.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { brasiliaDate } from "../utils/academic-date.ts";
import { addDays, reviewDays } from "../utils/review-plan.ts";
import { FindCurrentSemesterByUserService } from "./semester-service.ts";

export const REVIEWS_PRO_MESSAGE = "O plano de revisão é do Pro.";
const REVIEW_HORIZON_DAYS = 30;

// Fuso fixo UTC-3: o dia de Brasília começa às 03:00Z.
export const startOfBrasiliaDay = (day: string) => new Date(`${day}T03:00:00Z`);

async function assertPro(userId: string) {
  if ((await planOf(userId)) !== "PRO") throw new ForbiddenException(REVIEWS_PRO_MESSAGE, ErrorCode.PLAN_LIMIT_REACHED);
}

export async function ListReviewSessionsService(userId: string, days: number) {
  await assertPro(userId);
  const today = brasiliaDate();
  const lastDay = addDays(today, days - 1);

  const semester = await FindCurrentSemesterByUserService(userId);
  if (!semester) return { sessions: [] };

  const evaluations = await prisma.evaluation.findMany({
    where: {
      score: null,
      date: { gte: startOfBrasiliaDay(addDays(today, 1)), lt: startOfBrasiliaDay(addDays(today, REVIEW_HORIZON_DAYS + 1)) },
      discipline: { userId, semesterId: semester.id },
    },
    select: { id: true, title: true, date: true, discipline: { select: { id: true, name: true } } },
  });

  const sessions = evaluations.flatMap((e) =>
    reviewDays(brasiliaDate(e.date), today)
      .filter((day) => day <= lastDay)
      .map((day) => ({
        evaluationId: e.id,
        evaluationTitle: e.title,
        evaluationDate: e.date.toISOString(),
        disciplineId: e.discipline.id,
        disciplineName: e.discipline.name,
        day,
      })),
  );

  const checks = sessions.length
    ? await prisma.reviewCheck.findMany({
        where: { userId, evaluationId: { in: evaluations.map((e) => e.id) }, day: { gte: today, lte: lastDay } },
        select: { evaluationId: true, day: true },
      })
    : [];
  const done = new Set(checks.map((c) => `${c.evaluationId}|${c.day}`));

  return {
    sessions: sessions
      .map((s) => ({ ...s, done: done.has(`${s.evaluationId}|${s.day}`) }))
      .sort((a, b) => a.day.localeCompare(b.day) || a.evaluationDate.localeCompare(b.evaluationDate)),
  };
}

export async function SetReviewDoneService(userId: string, evaluationId: string, day: string, done: boolean) {
  await assertPro(userId);
  const evaluation = await prisma.evaluation.findFirst({
    where: { id: evaluationId, discipline: { userId } },
    select: { date: true },
  });
  if (!evaluation) throw new NotFoundException("Avaliação não encontrada.", ErrorCode.EVALUATION_NOT_FOUND);
  // today = "0000-00-00" não corta nada: a validade do dia é relativa à prova, não a hoje.
  if (!reviewDays(brasiliaDate(evaluation.date), "0000-00-00").includes(day)) {
    throw new NotFoundException("Esse dia não faz parte do plano de revisão da avaliação.", ErrorCode.NOT_FOUND);
  }

  if (done) {
    await prisma.reviewCheck.upsert({
      where: { evaluationId_day: { evaluationId, day } },
      create: { userId, evaluationId, day },
      update: {},
    });
  } else {
    await prisma.reviewCheck.deleteMany({ where: { evaluationId, day, userId } });
  }
  return { done };
}
