import { prisma } from "../../../lib/prisma.ts";

/** RN23/UC03: todos os dados do usuário em JSON estruturado, sem o hash da senha. */
export async function ExportUserDataService(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    omit: { passwordHash: true },
    include: {
      semesters: { orderBy: { startDate: "asc" } },
      disciplines: {
        orderBy: { name: "asc" },
        include: { schedules: { include: { attendances: true } }, evaluations: true },
      },
      tasks: { orderBy: { dueDate: "asc" } },
      inboxItems: { orderBy: { createdAt: "asc" } },
      notifications: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!user) return null;

  // Material não tem relação com User: dono direto ou pela disciplina (materiais antigos).
  const materials = await prisma.material.findMany({
    where: { OR: [{ userId }, { discipline: { userId } }] },
    orderBy: { createdAt: "asc" },
  });

  return { exportedAt: new Date().toISOString(), ...user, materials };
}
