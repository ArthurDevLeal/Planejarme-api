import { prisma } from "../../../lib/prisma.ts";

export async function ExportUserDataService(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    omit: { passwordHash: true, stripeCustomerId: true, referredById: true, affiliateBlockReason: true, affiliateBlockedAt: true },
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

  const materials = await prisma.material.findMany({
    where: { OR: [{ userId }, { discipline: { userId } }] },
    orderBy: { createdAt: "asc" },
  });

  return { exportedAt: new Date().toISOString(), ...user, materials };
}
