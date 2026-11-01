import { prisma } from "../../lib/prisma.ts";
import { CreateMaterialSchemaType, UpdateMaterialSchemaType } from "../schemas/material-schema.ts";

// storagePath e userId vêm só do servidor (upload e token), nunca do corpo da requisição.
export async function CreateMaterialService(data: CreateMaterialSchemaType & { userId: string; storagePath?: string }) {
  // Anexo de tarefa sem disciplina informada fica na disciplina da tarefa (e não cai na caixa de entrada).
  let disciplineId = data.disciplineId;
  if (data.taskId && disciplineId == null) {
    disciplineId = (await prisma.task.findUnique({ where: { id: data.taskId }, select: { disciplineId: true } }))?.disciplineId ?? null;
  }
  return prisma.material.create({
    data: {
      title: data.title,
      type: data.type,
      url: data.url ?? "",
      fileSizeMb: data.fileSizeMb,
      mimeType: data.mimeType,
      storagePath: data.storagePath,
      userId: data.userId,
      disciplineId,
      taskId: data.taskId,
    },
    include: {
      discipline: {
        select: { id: true, name: true, semesterId: true },
      },
    },
  });
}

export function FindMaterialByIdService(id: string) {
  return prisma.material.findFirst({
    where: { id, deletedAt: null },
    include: {
      discipline: {
        select: { id: true, name: true, semesterId: true },
      },
    },
  });
}

export function FindMaterialsByDisciplineService(disciplineId: string) {
  return prisma.material.findMany({
    where: { disciplineId, deletedAt: null },
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
      deletedAt: null,
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
      ...(data.disciplineId !== undefined ? { disciplineId: data.disciplineId } : {}),
      ...(data.taskId !== undefined ? { taskId: data.taskId } : {}),
    },
    include: {
      discipline: {
        select: { id: true, name: true, semesterId: true },
      },
    },
  });
}

/** RN16: vai para a lixeira; o arquivo no Storage só sai na exclusão definitiva. */
export function DeleteMaterialService(id: string) {
  return prisma.material.update({ where: { id }, data: { deletedAt: new Date() } });
}

/** RF13: anexos de uma tarefa. */
export function FindMaterialsByTaskService(taskId: string) {
  return prisma.material.findMany({
    where: { taskId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
}
