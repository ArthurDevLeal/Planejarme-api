import { prisma } from "../../lib/prisma";
import { CreateMaterialSchemaType, UpdateMaterialSchemaType } from "../schemas/material-schema";

export function CreateMaterialService(data: CreateMaterialSchemaType) {
  return prisma.material.create({ data });
}

export function FindMaterialByIdService(id: string) {
  return prisma.material.findUnique({ where: { id } });
}

export function FindMaterialsByDisciplineService(disciplineId: string) {
  return prisma.material.findMany({
    where: { disciplineId },
    orderBy: { createdAt: "desc" },
  });
}

export function FindMaterialsByUserService(userId: string) {
  return prisma.material.findMany({
    where: { discipline: { userId } },
    include: { discipline: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export function UpdateMaterialService(id: string, data: UpdateMaterialSchemaType) {
  return prisma.material.update({ where: { id }, data });
}

export function DeleteMaterialService(id: string) {
  return prisma.material.delete({ where: { id } });
}
