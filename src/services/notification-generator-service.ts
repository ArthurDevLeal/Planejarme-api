import { prisma } from "../../lib/prisma.ts";
import { brasiliaDate } from "../utils/academic-date.ts";

const DAY_MS = 86_400_000;

function dayOffset(today: string, date: Date) {
  return Math.round((Date.parse(`${brasiliaDate(date)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

function whenLabel(offset: number) {
  return offset === 0 ? "hoje" : offset === 1 ? "amanhã" : `em ${offset} dias`;
}

export async function GenerateDueNotificationsService(now = new Date()) {
  const today = brasiliaDate(now);
  const range = { gte: new Date(now.getTime() - DAY_MS), lte: new Date(now.getTime() + 4 * DAY_MS) };

  const [tasks, evaluations] = await Promise.all([
    prisma.task.findMany({
      where: { status: { not: "COMPLETED" }, deletedAt: null, dueDate: range },
      select: { id: true, title: true, dueDate: true, userId: true, discipline: { select: { name: true } } },
    }),
    prisma.evaluation.findMany({
      where: { score: null, date: range },
      select: { id: true, title: true, date: true, discipline: { select: { name: true, userId: true } } },
    }),
  ]);

  const data = [
    ...tasks.flatMap((task) => {
      const offset = dayOffset(today, task.dueDate);
      if (offset < 0 || offset > 1) return [];
      const subject = task.discipline ? ` (${task.discipline.name})` : "";
      return [{
        userId: task.userId,
        type: "TASK_DUE",
        title: "Tarefa vence em breve",
        message: `"${task.title}"${subject} vence ${whenLabel(offset)}.`,
        dedupeKey: `task:${task.id}:${brasiliaDate(task.dueDate)}`,
      }];
    }),
    ...evaluations.flatMap((evaluation) => {
      const offset = dayOffset(today, evaluation.date);
      if (offset < 0 || offset > 2) return [];
      return [{
        userId: evaluation.discipline.userId,
        type: "EXAM_SOON",
        title: "Avaliação chegando",
        message: `"${evaluation.title}" de ${evaluation.discipline.name} é ${whenLabel(offset)}.`,
        dedupeKey: `evaluation:${evaluation.id}:${brasiliaDate(evaluation.date)}`,
      }];
    }),
  ];

  if (data.length === 0) return { created: 0 };
  const { count } = await prisma.notification.createMany({ data, skipDuplicates: true });
  return { created: count };
}
