import { prisma } from "../../lib/prisma";
import { CreateScheduleSchemaType, UpdateScheduleSchemaType } from "../schemas/schedule-schema";

export function CreateScheduleService(data: CreateScheduleSchemaType) {
  return prisma.schedule.create({ data });
}

export function FindScheduleByIdService(id: string) {
  return prisma.schedule.findUnique({ where: { id } });
}

export function FindSchedulesByDisciplineService(disciplineId: string) {
  return prisma.schedule.findMany({
    where: { disciplineId },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
}

export function FindSchedulesByUserService(userId: string) {
  return prisma.schedule.findMany({
    where: { discipline: { userId } },
    include: { discipline: { select: { id: true, name: true } } },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
}

export function UpdateScheduleService(id: string, data: UpdateScheduleSchemaType) {
  return prisma.schedule.update({ where: { id }, data });
}

export async function UpdateScheduleSeriesService(userId: string, id: string, data: UpdateScheduleSchemaType) {
  const schedule = await prisma.schedule.findFirst({ where: { id, discipline: { userId } }, select: { disciplineId: true } });
  if (!schedule) return null;
  return prisma.$transaction(async (transaction) => {
    await transaction.schedule.updateMany({ where: { disciplineId: schedule.disciplineId }, data });
    return transaction.schedule.findMany({ where: { disciplineId: schedule.disciplineId }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] });
  });
}

export function DeleteScheduleService(id: string) {
  return prisma.schedule.delete({ where: { id } });
}
