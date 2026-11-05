import { prisma } from "../../lib/prisma.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { CreateMaterialSchemaType, UpdateMaterialSchemaType } from "../schemas/material-schema.ts";

// storagePath e userId vêm só do servidor (upload e token), nunca do corpo da requisição.
export async function CreateMaterialService(data: CreateMaterialSchemaType & { userId: string; storagePath?: string }) {
  const folder = data.folderId ? await prisma.folder.findFirst({ where: { id: data.folderId, deletedAt: null }, select: { id: true, disciplineId: true } }) : null;
  // Anexo de tarefa sem disciplina informada fica na disciplina da tarefa (e não cai na caixa de entrada).
  let disciplineId = folder ? folder.disciplineId : data.disciplineId;
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
      folderId: folder?.id ?? null,
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

export async function UpdateMaterialService(id: string, data: UpdateMaterialSchemaType) {
  // Dentro de uma pasta, a disciplina é sempre a da pasta. Escolher só a disciplina tira o arquivo da pasta.
  let disciplineId = data.disciplineId;
  let folderId = data.folderId;
  if (data.folderId) {
    const folder = await prisma.folder.findFirst({ where: { id: data.folderId, deletedAt: null }, select: { disciplineId: true } });
    if (!folder) throw new NotFoundException("Pasta não encontrada.", ErrorCode.NOT_FOUND);
    disciplineId = folder.disciplineId;
  } else if (data.disciplineId !== undefined && data.folderId === undefined) {
    folderId = null;
  }
  return prisma.material.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.url !== undefined ? { url: data.url } : {}),
      ...(data.fileSizeMb !== undefined ? { fileSizeMb: data.fileSizeMb } : {}),
      ...(data.mimeType !== undefined ? { mimeType: data.mimeType } : {}),
      ...(disciplineId !== undefined ? { disciplineId } : {}),
      ...(folderId !== undefined ? { folderId } : {}),
      ...(data.taskId !== undefined ? { taskId: data.taskId } : {}),
    },
    include: {
      discipline: {
        select: { id: true, name: true, semesterId: true },
      },
    },
  });
}

/** RN16: vai para a lixeira; o arquivo no Storage só sai na exclusão definitiva. O compartilhamento acaba aqui. */
export async function DeleteMaterialService(id: string) {
  const [material] = await prisma.$transaction([
    prisma.material.update({ where: { id }, data: { deletedAt: new Date() } }),
    prisma.shareLink.deleteMany({ where: { materialId: id } }),
    prisma.shareInvite.deleteMany({ where: { materialId: id } }),
  ]);
  return material;
}

/** RF13: anexos de uma tarefa. */
export function FindMaterialsByTaskService(taskId: string) {
  return prisma.material.findMany({
    where: { taskId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
}
