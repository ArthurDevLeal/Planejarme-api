import { brasiliaDate, courseWindow, scheduleAbsences } from "../../utils/academic-date.ts";
import { prisma } from "../../../lib/prisma.ts";
import type { Prisma } from "../../../generated/prisma/client.ts";
import { EnsureUserHasCurrentSemester } from "../semester-service.ts";
import { withTaskStatus } from "../../utils/task-status.ts";
import type { DisciplineInclude } from "../../schemas/user-schema.ts";

/** Base de toda tela: quem é o usuário, que dia é e qual semestre está em uso. */
export async function GetUserContextService(
  userId: string,
  requestedSemesterId?: string,
) {
  const findSemesters = () =>
    prisma.semester.findMany({
      where: { userId },
      orderBy: [{ isCurrent: "desc" }, { name: "desc" }, { createdAt: "desc" }],
    });

  const [user, foundSemesters, orphanDiscipline, orphanTask, disciplineCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        course: true,
        institution: true,
        passingScore: true,
        maxAbsencePct: true,
        roundingMode: true,
      },
    }),
    findSemesters(),
    prisma.discipline.findFirst({ where: { userId, semesterId: null }, select: { id: true } }),
    prisma.task.findFirst({ where: { userId, semesterId: null }, select: { id: true } }),
    prisma.discipline.count({ where: { userId } }),
  ]);

  if (!user) return null;

  // Esta rota abre toda tela do painel: só escreve no banco quando há o que acertar.
  let semesters = foundSemesters;
  if (!semesters.length || orphanDiscipline || orphanTask) {
    await EnsureUserHasCurrentSemester(userId);
    semesters = await findSemesters();
  }

  const activeSemester =
    (requestedSemesterId
      ? semesters.find((s) => s.id === requestedSemesterId)
      : semesters.find((s) => s.isCurrent)) ?? semesters[0];

  return {
    user,
    today: brasiliaDate(),
    currentSemesterId: activeSemester?.id ?? null,
    currentSemesterName: activeSemester?.name ?? null,
    disciplineCount,
    semesters: semesters.map((s) => ({
      id: s.id,
      name: s.name,
      isCurrent: s.isCurrent,
      startDate: s.startDate ? s.startDate.toISOString().slice(0, 10) : null,
      endDate: s.endDate ? s.endDate.toISOString().slice(0, 10) : null,
    })),
  };
}

type FullDiscipline = Prisma.DisciplineGetPayload<{
  include: {
    semester: true;
    schedules: { include: { attendances: true } };
    materials: true;
    evaluations: true;
  };
}>;
type DisciplineRow = Omit<FullDiscipline, "semester" | "schedules" | "materials" | "evaluations"> &
  Partial<Pick<FullDiscipline, "semester" | "schedules" | "materials" | "evaluations">>;

/**
 * Só o que a tela pede em `include`. `schedules` é o que permite somar as faltas de horário:
 * sem ele, `absences` traz apenas as faltas lançadas à mão.
 */
export async function GetUserDisciplinesService(
  userId: string,
  semesterId: string | undefined,
  include: DisciplineInclude[] = [],
) {
  const withSchedules = include.includes("schedules") || include.includes("attendances");
  const rows = (await prisma.discipline.findMany({
    where: { userId, ...(semesterId ? { semesterId } : {}) },
    include: {
      semester: withSchedules,
      schedules: withSchedules ? { include: { attendances: true } } : false,
      materials: include.includes("materials") ? { where: { deletedAt: null } } : false,
      evaluations: include.includes("evaluations"),
    },
    orderBy: { name: "asc" },
  })) as DisciplineRow[];

  const today = brasiliaDate();
  return rows.map(({ semester, schedules, ...discipline }) => {
    if (!schedules) {
      return { ...discipline, manualAbsences: undefined, scheduleAbsences: undefined, schedules: undefined };
    }
    const window = courseWindow(semester);
    const scheduleAbsencesTotal = schedules.reduce(
      (total, schedule) => total + scheduleAbsences(schedule, today, window),
      0,
    );
    return {
      ...discipline,
      manualAbsences: discipline.absences,
      scheduleAbsences: scheduleAbsencesTotal,
      absences: Math.min(discipline.workloadHours, discipline.absences + scheduleAbsencesTotal),
      schedules: schedules.map(({ attendances, ...schedule }) => {
        const days = attendances.map((item) => ({ ...item, date: item.date.toISOString().slice(0, 10) }));
        return {
          ...schedule,
          ...(include.includes("attendances") ? { attendances: days } : {}),
          attended: days.some((item) => item.attended && item.date === today),
        };
      }),
    };
  });
}

export async function GetUserTasksService(userId: string, semesterId?: string) {
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(semesterId
        ? {
            OR: [
              { semesterId },
              { discipline: { semesterId } },
              { semesterId: null, disciplineId: null },
            ],
          }
        : {}),
    },
    omit: { description: true },
    include: {
      discipline: { select: { id: true, name: true } },
      _count: { select: { materials: { where: { deletedAt: null } } } },
    },
    orderBy: { dueDate: "asc" },
  });
  return tasks.map((task) => withTaskStatus(task));
}

export async function GetUserDashboardService(
  userId: string,
  requestedSemesterId?: string,
) {
  const context = await GetUserContextService(userId, requestedSemesterId);
  if (!context) return null;
  const { disciplineCount: _, ...rest } = context;
  const semesterId = context.currentSemesterId ?? undefined;

  const [disciplines, tasksData, inboxItems, notifications] = await Promise.all([
    GetUserDisciplinesService(userId, semesterId, ["schedules", "attendances", "materials", "evaluations"]),
    GetUserTasksService(userId, semesterId),
    prisma.inboxItem.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const totalWorkloadHours = disciplines.reduce(
    (total, discipline) => total + discipline.workloadHours,
    0,
  );
  const totalAbsences = disciplines.reduce(
    (total, discipline) => total + discipline.absences,
    0,
  );

  return {
    ...rest,
    disciplines,
    tasks: tasksData,
    inboxItems,
    notifications,
    summary: {
      disciplineCount: disciplines.length,
      totalWorkloadHours,
      totalAbsences,
      scheduleCount: disciplines.reduce(
        (total, discipline) => total + (discipline.schedules?.length ?? 0),
        0,
      ),
      materialCount: disciplines.reduce(
        (total, discipline) => total + (discipline.materials?.length ?? 0),
        0,
      ),
      evaluationCount: disciplines.reduce(
        (total, discipline) => total + (discipline.evaluations?.length ?? 0),
        0,
      ),
      pendingTaskCount: tasksData.filter((task) => task.status !== "COMPLETED")
        .length,
      unreadNotificationCount: notifications.filter(
        (notification) => !notification.read,
      ).length,
    },
  };
}
