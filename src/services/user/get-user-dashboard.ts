import { brasiliaDate, scheduleAbsences } from "../../utils/academic-date.ts";
import { prisma } from "../../../lib/prisma.ts";
import { EnsureUserHasCurrentSemester } from "../semester-service.ts";

export async function GetUserDashboardService(
  userId: string,
  requestedSemesterId?: string,
) {
  const user = await prisma.user.findUnique({
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
    },
  });

  if (!user) return null;

  await EnsureUserHasCurrentSemester(userId);

  const semesters = await prisma.semester.findMany({
    where: { userId },
    orderBy: [{ isCurrent: "desc" }, { name: "desc" }, { createdAt: "desc" }],
  });

  const activeSemester =
    (requestedSemesterId
      ? semesters.find((s) => s.id === requestedSemesterId)
      : semesters.find((s) => s.isCurrent)) ?? semesters[0];

  const semesterFilter = activeSemester
    ? { semesterId: activeSemester.id }
    : {};

  const [disciplinesData, tasksData, inboxItems, notifications] =
    await Promise.all([
      prisma.discipline.findMany({
        where: { userId, ...semesterFilter },
        include: {
          schedules: { include: { attendances: true } },
          materials: true,
          evaluations: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.task.findMany({
        where: {
          userId,
          ...(activeSemester
            ? {
                OR: [
                  { semesterId: activeSemester.id },
                  { discipline: { semesterId: activeSemester.id } },
                  { semesterId: null, disciplineId: null },
                ],
              }
            : {}),
        },
        include: { discipline: { select: { id: true, name: true } } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.inboxItem.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const today = brasiliaDate();
  const disciplines = disciplinesData.map((discipline) => {
    const scheduleAbsencesTotal = discipline.schedules.reduce(
      (total, schedule) => total + scheduleAbsences(schedule, today),
      0,
    );
    const totalAbsences = Math.min(
      discipline.workloadHours,
      discipline.absences + scheduleAbsencesTotal,
    );
    return {
      ...discipline,
      manualAbsences: discipline.absences,
      scheduleAbsences: scheduleAbsencesTotal,
      absences: totalAbsences,
      schedules: discipline.schedules.map(({ attendances, ...schedule }) => ({
        ...schedule,
        attendances: attendances.map((item) => ({
          ...item,
          date: item.date.toISOString().slice(0, 10),
        })),
        attended: attendances.some(
          (item) =>
            item.attended && item.date.toISOString().slice(0, 10) === today,
        ),
      })),
    };
  });
  const totalWorkloadHours = disciplines.reduce(
    (total, discipline) => total + discipline.workloadHours,
    0,
  );
  const totalAbsences = disciplines.reduce(
    (total, discipline) => total + discipline.absences,
    0,
  );

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      course: user.course,
      institution: user.institution,
      passingScore: user.passingScore,
      maxAbsencePct: user.maxAbsencePct,
    },
    today,
    currentSemesterId: activeSemester?.id ?? null,
    currentSemesterName: activeSemester?.name ?? null,
    semesters: semesters.map((s) => ({
      id: s.id,
      name: s.name,
      isCurrent: s.isCurrent,
      startDate: s.startDate ? s.startDate.toISOString().slice(0, 10) : null,
      endDate: s.endDate ? s.endDate.toISOString().slice(0, 10) : null,
    })),
    disciplines,
    tasks: tasksData,
    inboxItems,
    notifications,
    summary: {
      disciplineCount: disciplines.length,
      totalWorkloadHours,
      totalAbsences,
      scheduleCount: disciplines.reduce(
        (total, discipline) => total + discipline.schedules.length,
        0,
      ),
      materialCount: disciplines.reduce(
        (total, discipline) => total + discipline.materials.length,
        0,
      ),
      evaluationCount: disciplines.reduce(
        (total, discipline) => total + discipline.evaluations.length,
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
