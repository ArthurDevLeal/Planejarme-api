import { prisma } from "../../../lib/prisma";

export async function GetUserDashboardService(userId: string) {
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
      disciplines: {
        include: {
          schedules: true,
          materials: true,
          evaluations: true,
        },
        orderBy: { name: "asc" },
      },
      tasks: {
        include: { discipline: { select: { id: true, name: true } } },
        orderBy: { dueDate: "asc" },
      },
      inboxItems: { orderBy: { createdAt: "desc" } },
      notifications: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!user) return null;

  const totalWorkloadHours = user.disciplines.reduce(
    (total, discipline) => total + discipline.workloadHours,
    0,
  );
  const totalAbsences = user.disciplines.reduce((total, discipline) => total + discipline.absences, 0);

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
    disciplines: user.disciplines,
    tasks: user.tasks,
    inboxItems: user.inboxItems,
    notifications: user.notifications,
    summary: {
      disciplineCount: user.disciplines.length,
      totalWorkloadHours,
      totalAbsences,
      scheduleCount: user.disciplines.reduce((total, discipline) => total + discipline.schedules.length, 0),
      materialCount: user.disciplines.reduce((total, discipline) => total + discipline.materials.length, 0),
      evaluationCount: user.disciplines.reduce(
        (total, discipline) => total + discipline.evaluations.length,
        0,
      ),
      pendingTaskCount: user.tasks.filter((task) => task.status !== "COMPLETED").length,
      unreadNotificationCount: user.notifications.filter((notification) => !notification.read).length,
    },
  };
}
