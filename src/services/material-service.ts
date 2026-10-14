import { prisma } from "../../lib/prisma.ts";
import { CreateMaterialSchemaType, UpdateMaterialSchemaType } from "../schemas/material-schema.ts";

export function CreateMaterialService(data: CreateMaterialSchemaType) {
  return prisma.material.create({
    data: {
      title: data.title,
      type: data.type,
      url: data.url ?? "",
      fileSizeMb: data.fileSizeMb,
      mimeType: data.mimeType,
      storagePath: data.storagePath,
      userId: data.userId,
      disciplineId: data.disciplineId,
    },
    include: {
      discipline: {
        select: { id: true, name: true, semesterId: true },
      },
    },
  });
}

export function FindMaterialByIdService(id: string) {
  return prisma.material.findUnique({
    where: { id },
    include: {
      discipline: {
        select: { id: true, name: true, semesterId: true },
      },
    },
  });
}

export function FindMaterialsByDisciplineService(disciplineId: string) {
  return prisma.material.findMany({
    where: { disciplineId },
    include: {
      discipline: {
        select: { id: true, name: true, semesterId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function FindMaterialsByUserService(userId: string, semesterId?: string) {
  return prisma.material.findMany({
    where: {
      OR: [
        {
          discipline: {
            userId,
            ...(semesterId ? { OR: [{ semesterId }, { semesterId: null }] } : {}),
          },
        },
        {
          userId,
          disciplineId: null,
        },
        {
          userId,
          discipline: semesterId
            ? { OR: [{ semesterId }, { semesterId: null }] }
            : undefined,
        },
      ],
    },
    include: {
      discipline: {
        select: { id: true, name: true, semesterId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function UpdateMaterialService(id: string, data: UpdateMaterialSchemaType) {
  return prisma.material.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.url !== undefined ? { url: data.url } : {}),
      ...(data.fileSizeMb !== undefined ? { fileSizeMb: data.fileSizeMb } : {}),
      ...(data.mimeType !== undefined ? { mimeType: data.mimeType } : {}),
      ...(data.storagePath !== undefined ? { storagePath: data.storagePath } : {}),
      ...(data.userId !== undefined ? { userId: data.userId } : {}),
      ...(data.disciplineId !== undefined ? { disciplineId: data.disciplineId } : {}),
    },
    include: {
      discipline: {
        select: { id: true, name: true, semesterId: true },
      },
    },
  });
}

export function DeleteMaterialService(id: string) {
  return prisma.material.delete({ where: { id } });
}
