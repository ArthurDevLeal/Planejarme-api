import { prisma } from "../../lib/prisma";
import { CreateDisciplineSchemaType, UpdateDisciplineSchemaType } from "../schemas/discipline-schema";

export function CreateDisciplineService(data: CreateDisciplineSchemaType) {
  return prisma.discipline.create({ data });
}

export function FindDisciplineByIdService(id: string) {
  return prisma.discipline.findUnique({
    where: { id },
    include: { schedules: true, materials: true },
  });
}

export function FindDisciplinesByUserService(userId: string) {
  return prisma.discipline.findMany({
    where: { userId },
    include: { schedules: true, materials: true },
    orderBy: { name: "asc" },
  });
}

export function UpdateDisciplineService(id: string, data: UpdateDisciplineSchemaType) {
  return prisma.discipline.update({ where: { id }, data });
}

export function DeleteDisciplineService(id: string) {
  return prisma.discipline.delete({ where: { id } });
}
