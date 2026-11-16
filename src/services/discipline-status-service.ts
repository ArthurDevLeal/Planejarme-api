import { prisma } from "../../lib/prisma.ts";
import {
  computeStatus,
  describeRule,
  resolveRule,
  type DisciplineStatus,
  type RoundingMode,
  type RuleDefaults,
  type RuleFields,
} from "../domain/approval.ts";
import { brasiliaDate, courseWindow, scheduleAbsences } from "../utils/academic-date.ts";

export interface StatusUser extends RuleDefaults {
  roundingMode: string;
}

export interface StatusDiscipline extends RuleFields {
  workloadHours: number;
  evaluations: { id: string; title: string; weight: number; score: number | null; date: Date; kind: string }[];
}

export type DisciplineStatusPayload = DisciplineStatus & { ruleText: string };

/** Situação da disciplina com a regra dela (ou o padrão do usuário). absencesUsed já inclui as faltas por horário. */
export function statusForDiscipline(
  discipline: StatusDiscipline,
  absencesUsed: number,
  user: StatusUser,
  today = brasiliaDate(),
): DisciplineStatusPayload {
  const rule = resolveRule(discipline, user);
  const status = computeStatus(
    {
      evaluations: discipline.evaluations.map((item) => ({
        id: item.id,
        title: item.title,
        weight: item.weight,
        score: item.score,
        date: item.date.toISOString().slice(0, 10),
        kind: item.kind,
      })),
      absencesUsed,
      workloadHours: discipline.workloadHours,
      rule,
      today,
    },
    user.roundingMode as RoundingMode,
  );
  return { ...status, ruleText: describeRule(rule, discipline.workloadHours) };
}

export const STATUS_USER_SELECT = { passingScore: true, maxAbsencePct: true, roundingMode: true } as const;

/** Situação de todas as disciplinas de um usuário (ou de uma só). Usado pelo cron e por GET /discipline/:id/status. */
export async function GetDisciplineStatusesService(userId: string, disciplineId?: string) {
  const [user, disciplines] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: STATUS_USER_SELECT }),
    prisma.discipline.findMany({
      where: { userId, ...(disciplineId ? { id: disciplineId } : {}) },
      include: { semester: true, evaluations: true, schedules: { include: { attendances: true } } },
    }),
  ]);
  if (!user) return [];
  const today = brasiliaDate();
  return disciplines.map((discipline) => {
    const window = courseWindow(discipline.semester);
    const scheduled = discipline.schedules.reduce((total, s) => total + scheduleAbsences(s, today, window), 0);
    const absences = Math.min(discipline.workloadHours, discipline.absences + scheduled);
    return { discipline, status: statusForDiscipline(discipline, absences, user, today) };
  });
}
