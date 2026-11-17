import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.ts";
import { planOf } from "../config/plans.ts";
import { brasiliaDate } from "../utils/academic-date.ts";
import { buildCalendar, IcalEvent } from "../utils/ical.ts";
import { addDays, reviewDays } from "../utils/review-plan.ts";
import { startOfBrasiliaDay } from "./review-service.ts";
import { FindCurrentSemesterByUserService } from "./semester-service.ts";

const feedUrl = (base: string, token: string | null) => ({
  url: token ? `${base.replace(/\/+$/, "")}/public/calendar/${token}.ics` : null,
});

export async function GetCalendarUrlService(userId: string, base: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { calendarToken: true } });
  return feedUrl(base, user?.calendarToken ?? null);
}

export async function RotateCalendarUrlService(userId: string, base: string) {
  const token = crypto.randomBytes(24).toString("base64url");
  await prisma.user.update({ where: { id: userId }, data: { calendarToken: token } });
  return feedUrl(base, token);
}

export async function RevokeCalendarUrlService(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { calendarToken: null } });
  return { url: null };
}

/** null = token desconhecido. Janela: de hoje-7 a hoje+120 (Brasília). */
export async function BuildCalendarByTokenService(token: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { calendarToken: token }, select: { id: true } });
  if (!user) return null;

  const today = brasiliaDate();
  const from = addDays(today, -7);
  const to = addDays(today, 120);
  const range = { gte: startOfBrasiliaDay(from), lt: startOfBrasiliaDay(addDays(to, 1)) };

  const [tasks, evaluations, plan] = await Promise.all([
    prisma.task.findMany({
      where: { userId: user.id, deletedAt: null, status: { not: "COMPLETED" }, dueDate: range },
      select: { id: true, title: true, dueDate: true },
      orderBy: { dueDate: "asc" },
      take: 500,
    }),
    // +7 dias além da janela: a revisão D-7 de uma prova fora dela ainda cai dentro.
    prisma.evaluation.findMany({
      where: { score: null, date: { gte: range.gte, lt: startOfBrasiliaDay(addDays(to, 8)) }, discipline: { userId: user.id } },
      select: { id: true, title: true, date: true, discipline: { select: { name: true, semesterId: true } } },
      orderBy: { date: "asc" },
      take: 300,
    }),
    planOf(user.id),
  ]);
  const isPro = plan === "PRO";
  // Revisões seguem a mesma regra de /reviews: só o semestre atual e só o que ainda não foi marcado.
  const currentSemesterId = isPro ? (await FindCurrentSemesterByUserService(user.id))?.id : undefined;
  const done = new Set(
    isPro
      ? (await prisma.reviewCheck.findMany({ where: { userId: user.id, day: { gte: today } }, select: { evaluationId: true, day: true } })).map(
          (c) => `${c.evaluationId}|${c.day}`,
        )
      : [],
  );

  const events: IcalEvent[] = tasks.map((t) => ({ uid: `task-${t.id}@planejar.me`, day: brasiliaDate(t.dueDate), summary: t.title }));
  for (const e of evaluations) {
    const day = brasiliaDate(e.date);
    if (day <= to) events.push({ uid: `eval-${e.id}@planejar.me`, day, summary: `Prova: ${e.title} — ${e.discipline.name}` });
    if (!isPro || !currentSemesterId || e.discipline.semesterId !== currentSemesterId) continue;
    for (const review of reviewDays(day, today).filter((d) => d <= to && !done.has(`${e.id}|${d}`))) {
      events.push({ uid: `review-${e.id}-${review}@planejar.me`, day: review, summary: `Revisar: ${e.title} — ${e.discipline.name}` });
    }
  }
  return buildCalendar(events);
}
