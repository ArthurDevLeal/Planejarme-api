import { prisma } from "../../lib/prisma.ts";
import { BadRequestsException } from "../exceptions/bad-requests.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { CreateFolderSchemaType, MoveFolderSchemaType } from "../schemas/folder-schema.ts";
import { collectSubtree } from "../utils/folder-tree.ts";

const notFound = () => new NotFoundException("Pasta não encontrada. Atualize a página.", ErrorCode.NOT_FOUND);

export function FindFoldersByUserService(userId: string) {
  return prisma.folder.findMany({ where: { userId, deletedAt: null }, orderBy: { name: "asc" } });
}

async function findActiveFolder(id: string) {
  const folder = await prisma.folder.findFirst({ where: { id, deletedAt: null } });
  if (!folder) throw notFound();
  return folder;
}

export async function CreateFolderService(userId: string, data: CreateFolderSchemaType) {
  const parent = data.parentId ? await findActiveFolder(data.parentId) : null;
  return prisma.folder.create({
    data: { name: data.name, userId, parentId: parent?.id ?? null, disciplineId: parent ? parent.disciplineId : data.disciplineId ?? null },
  });
}

export function RenameFolderService(id: string, name: string) {
  return prisma.folder.update({ where: { id }, data: { name } });
}

export async function MoveFolderService(id: string, userId: string, data: MoveFolderSchemaType) {
  const folders = await prisma.folder.findMany({ where: { userId }, select: { id: true, parentId: true } });
  const subtree = [...collectSubtree(folders, id)];
  if (data.parentId && subtree.includes(data.parentId)) {
    throw new BadRequestsException("Uma pasta não pode ir para dentro dela mesma.", ErrorCode.INVALID_DATA);
  }
  const parent = data.parentId ? await findActiveFolder(data.parentId) : null;
  const disciplineId = parent ? parent.disciplineId : data.disciplineId;

  await prisma.$transaction([
    prisma.folder.update({ where: { id }, data: { parentId: parent?.id ?? null } }),
    prisma.folder.updateMany({ where: { id: { in: subtree } }, data: { disciplineId } }),
    prisma.material.updateMany({ where: { folderId: { in: subtree } }, data: { disciplineId } }),
  ]);
  return findActiveFolder(id);
}

export async function TrashFolderService(id: string, userId: string) {
  const folders = await prisma.folder.findMany({ where: { userId, deletedAt: null }, select: { id: true, parentId: true } });
  const subtree = [...collectSubtree(folders, id)];
  const materials = await prisma.material.findMany({ where: { folderId: { in: subtree }, deletedAt: null }, select: { id: true } });
  const materialIds = materials.map((material) => material.id);
  const deletedAt = new Date();
  const shared = { OR: [{ folderId: { in: subtree } }, { materialId: { in: materialIds } }] };

  await prisma.$transaction([
    prisma.folder.updateMany({ where: { id: { in: subtree } }, data: { deletedAt } }),
    prisma.material.updateMany({ where: { id: { in: materialIds } }, data: { deletedAt } }),
    prisma.shareLink.deleteMany({ where: shared }),
    prisma.shareInvite.deleteMany({ where: shared }),
  ]);
}
