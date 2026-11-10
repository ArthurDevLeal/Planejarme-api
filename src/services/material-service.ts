import { prisma } from "../../lib/prisma.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { supabase, SUPABASE_STORAGE_BUCKET } from "../lib/supabase.ts";
import { CreateMaterialSchemaType, UpdateMaterialSchemaType } from "../schemas/material-schema.ts";

// storagePath e userId vêm só do servidor (upload e token), nunca do corpo da requisição.
type StoredFile = { storagePath?: string; sizeBytes?: number; originalSizeBytes?: number; sha256?: string; thumbnailPath?: string | null; thumbnailBytes?: number | null };

// Miniaturas ficam em bucket privado: cada lista sai com URLs assinadas, numa chamada só ao Storage.
export async function withThumbnailUrls<T extends { thumbnailPath: string | null }>(materials: T[]): Promise<(T & { thumbnailUrl: string | null })[]> {
  const paths = [...new Set(materials.map((material) => material.thumbnailPath).filter((path): path is string => Boolean(path)))];
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).createSignedUrls(paths, 3600);
    for (const item of data ?? []) if (item.path && item.signedUrl) signed.set(item.path, item.signedUrl);
  }
  return materials.map((material) => ({ ...material, thumbnailUrl: (material.thumbnailPath && signed.get(material.thumbnailPath)) || null }));
}

export async function CreateMaterialService(data: CreateMaterialSchemaType & { userId: string } & StoredFile) {
  const folder = data.folderId ? await prisma.folder.findFirst({ where: { id: data.folderId, deletedAt: null }, select: { id: true, disciplineId: true } }) : null;
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
      sizeBytes: data.sizeBytes,
      originalSizeBytes: data.originalSizeBytes,
      sha256: data.sha256,
      thumbnailPath: data.thumbnailPath,
      thumbnailBytes: data.thumbnailBytes,
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

export async function FindMaterialsByDisciplineService(disciplineId: string) {
  return withThumbnailUrls(await prisma.material.findMany({
    where: { disciplineId, deletedAt: null },
    include: {
      discipline: {
        select: { id: true, name: true, semesterId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  }));
}

export async function FindMaterialsByUserService(userId: string, semesterId?: string) {
  return withThumbnailUrls(await prisma.material.findMany({
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
  }));
}

export async function UpdateMaterialService(id: string, data: UpdateMaterialSchemaType) {
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

export async function DeleteMaterialService(id: string) {
  const [material] = await prisma.$transaction([
    prisma.material.update({ where: { id }, data: { deletedAt: new Date() } }),
    prisma.shareLink.deleteMany({ where: { materialId: id } }),
    prisma.shareInvite.deleteMany({ where: { materialId: id } }),
  ]);
  return material;
}

export async function FindMaterialsByTaskService(taskId: string) {
  return withThumbnailUrls(await prisma.material.findMany({
    where: { taskId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  }));
}
