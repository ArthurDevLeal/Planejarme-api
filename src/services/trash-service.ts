import { prisma } from "../../lib/prisma.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { supabase, SUPABASE_STORAGE_BUCKET } from "../lib/supabase.ts";
import { collectSubtree } from "../utils/folder-tree.ts";

/** RN16: itens ficam 30 dias na lixeira antes da exclusão definitiva. */
export const TRASH_RETENTION_DAYS = 30;
const RETENTION_MS = TRASH_RETENTION_DAYS * 86_400_000;

export type TrashKind = "task" | "material" | "folder";

function purgeAt(deletedAt: Date) {
  return new Date(deletedAt.getTime() + RETENTION_MS).toISOString();
}

export async function FindTrashByUserService(userId: string) {
  const [tasks, materials, folders] = await Promise.all([
    prisma.task.findMany({
      where: { userId, deletedAt: { not: null } },
      select: { id: true, title: true, dueDate: true, deletedAt: true, discipline: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.material.findMany({
      where: { deletedAt: { not: null }, OR: [{ userId }, { discipline: { userId } }] },
      select: { id: true, title: true, type: true, url: true, storagePath: true, deletedAt: true, discipline: { select: { name: true } }, folder: { select: { deletedAt: true } } },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.folder.findMany({
      where: { userId, deletedAt: { not: null } },
      select: { id: true, name: true, deletedAt: true, parent: { select: { deletedAt: true } }, _count: { select: { materials: true } } },
      orderBy: { deletedAt: "desc" },
    }),
  ]);
  // O que foi excluído junto com a pasta aparece só como a pasta, que restaura tudo de uma vez.
  const sameDeletion = (a: Date | null | undefined, b: Date | null) => a?.getTime() === b?.getTime();
  return {
    retentionDays: TRASH_RETENTION_DAYS,
    tasks: tasks.map((task) => ({ ...task, purgeAt: purgeAt(task.deletedAt!) })),
    materials: materials
      .filter((material) => !sameDeletion(material.folder?.deletedAt, material.deletedAt))
      .map(({ folder: _folder, ...material }) => ({ ...material, purgeAt: purgeAt(material.deletedAt!) })),
    folders: folders
      .filter((folder) => !sameDeletion(folder.parent?.deletedAt, folder.deletedAt))
      .map(({ parent: _parent, _count, ...folder }) => ({ ...folder, fileCount: _count.materials, purgeAt: purgeAt(folder.deletedAt!) })),
  };
}

async function findTrashed(kind: TrashKind, id: string) {
  const where = { id, deletedAt: { not: null } };
  const item =
    kind === "task"
      ? await prisma.task.findFirst({ where, select: { id: true } })
      : kind === "folder"
        ? await prisma.folder.findFirst({ where, select: { id: true } })
        : await prisma.material.findFirst({ where, select: { id: true } });
  if (!item) {
    throw new NotFoundException(
      "Este item não está mais na lixeira. Atualize a página.",
      kind === "task" ? ErrorCode.TASK_NOT_FOUND : kind === "folder" ? ErrorCode.NOT_FOUND : ErrorCode.MATERIAL_NOT_FOUND,
    );
  }
}

export async function RestoreTrashItemService(kind: TrashKind, id: string) {
  await findTrashed(kind, id);
  if (kind === "task") return prisma.task.update({ where: { id }, data: { deletedAt: null } });
  if (kind === "folder") return restoreFolder(id);

  // Se a pasta dele continua na lixeira, o arquivo volta para fora dela.
  const material = await prisma.material.findUniqueOrThrow({ where: { id }, select: { folder: { select: { deletedAt: true } } } });
  return prisma.material.update({
    where: { id },
    data: { deletedAt: null, ...(material.folder?.deletedAt ? { folderId: null } : {}) },
  });
}

/** Restaura só o que saiu junto: arquivos excluídos antes da pasta continuam na lixeira. */
async function restoreFolder(id: string) {
  const folder = await prisma.folder.findUniqueOrThrow({
    where: { id },
    select: { userId: true, deletedAt: true, parent: { select: { deletedAt: true } } },
  });
  const sameBatch = await prisma.folder.findMany({
    where: { userId: folder.userId, deletedAt: folder.deletedAt },
    select: { id: true, parentId: true },
  });
  const subtree = [...collectSubtree(sameBatch, id)];
  return prisma.$transaction([
    prisma.folder.updateMany({ where: { id: { in: subtree } }, data: { deletedAt: null } }),
    prisma.folder.update({ where: { id }, data: { ...(folder.parent?.deletedAt ? { parentId: null } : {}) } }),
    prisma.material.updateMany({ where: { folderId: { in: subtree }, deletedAt: folder.deletedAt }, data: { deletedAt: null } }),
  ]);
}

/** Apaga do banco e do Storage. Anexos de uma tarefa saem junto com ela. */
async function destroy(where: { taskIds: string[]; materialIds: string[]; folderIds?: string[] }) {
  const folderIds = where.folderIds ?? [];
  const materials = await prisma.material.findMany({
    where: { OR: [{ id: { in: where.materialIds } }, { taskId: { in: where.taskIds } }, { folderId: { in: folderIds } }] },
    select: { id: true, storagePath: true },
  });
  await prisma.$transaction([
    prisma.material.deleteMany({ where: { id: { in: materials.map((m) => m.id) } } }),
    prisma.task.deleteMany({ where: { id: { in: where.taskIds } } }),
    prisma.folder.deleteMany({ where: { id: { in: folderIds } } }),
  ]);
  // Depois do banco: se o Storage falhar, sobram só arquivos órfãos, nunca registros apontando para nada.
  const paths = materials.map((m) => m.storagePath).filter((path): path is string => Boolean(path));
  if (paths.length > 0) {
    const { error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).remove(paths);
    if (error) console.error("[trash] arquivos não removidos do Storage", paths.length, error.message);
  }
  return { tasks: where.taskIds.length, materials: materials.length };
}

export async function DeleteTrashItemForeverService(kind: TrashKind, id: string) {
  await findTrashed(kind, id);
  if (kind === "folder") {
    const { userId } = await prisma.folder.findUniqueOrThrow({ where: { id }, select: { userId: true } });
    const folders = await prisma.folder.findMany({ where: { userId }, select: { id: true, parentId: true } });
    return destroy({ taskIds: [], materialIds: [], folderIds: [...collectSubtree(folders, id)] });
  }
  return destroy(kind === "task" ? { taskIds: [id], materialIds: [] } : { taskIds: [], materialIds: [id] });
}

/** Cron diário: apaga de vez o que está na lixeira há mais de 30 dias. */
export async function PurgeExpiredTrashService(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const [tasks, materials, folders] = await Promise.all([
    prisma.task.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } }),
    prisma.material.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } }),
    prisma.folder.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } }),
  ]);
  if (tasks.length === 0 && materials.length === 0 && folders.length === 0) return { tasks: 0, materials: 0 };
  return destroy({ taskIds: tasks.map((t) => t.id), materialIds: materials.map((m) => m.id), folderIds: folders.map((f) => f.id) });
}
