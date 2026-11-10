import { prisma } from "../../lib/prisma.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { CreateScheduleSchemaType, UpdateScheduleSchemaType } from "../schemas/schedule-schema.ts";
import { attendanceAnchorForSemester } from "./semester-service.ts";

export async function CreateScheduleService(data: CreateScheduleSchemaType) {
  const discipline = await prisma.discipline.findUnique({
    where: { id: data.disciplineId },
    select: { semesterId: true },
  });
  if (!discipline) {
    throw new NotFoundException(
      "Disciplina não encontrada. O registro pode ter sido removido.",
      ErrorCode.DISCIPLINE_NOT_FOUND,
    );
  }

  const attendanceSince = discipline.semesterId
    ? await attendanceAnchorForSemester(discipline.semesterId)
    : undefined;

  return prisma.schedule.create({ data: { ...data, attendanceSince } });
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
