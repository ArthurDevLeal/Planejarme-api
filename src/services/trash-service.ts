import { prisma } from "../../lib/prisma.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { supabase, SUPABASE_STORAGE_BUCKET } from "../lib/supabase.ts";

/** RN16: itens ficam 30 dias na lixeira antes da exclusão definitiva. */
export const TRASH_RETENTION_DAYS = 30;
const RETENTION_MS = TRASH_RETENTION_DAYS * 86_400_000;

export type TrashKind = "task" | "material";

function purgeAt(deletedAt: Date) {
  return new Date(deletedAt.getTime() + RETENTION_MS).toISOString();
}

export async function FindTrashByUserService(userId: string) {
  const [tasks, materials] = await Promise.all([
    prisma.task.findMany({
      where: { userId, deletedAt: { not: null } },
      select: { id: true, title: true, dueDate: true, deletedAt: true, discipline: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.material.findMany({
      where: { deletedAt: { not: null }, OR: [{ userId }, { discipline: { userId } }] },
      select: { id: true, title: true, type: true, url: true, storagePath: true, deletedAt: true, discipline: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
    }),
  ]);
  return {
    retentionDays: TRASH_RETENTION_DAYS,
    tasks: tasks.map((task) => ({ ...task, purgeAt: purgeAt(task.deletedAt!) })),
    materials: materials.map((material) => ({ ...material, purgeAt: purgeAt(material.deletedAt!) })),
  };
}

async function findTrashed(kind: TrashKind, id: string) {
  const item =
    kind === "task"
      ? await prisma.task.findFirst({ where: { id, deletedAt: { not: null } }, select: { id: true } })
      : await prisma.material.findFirst({ where: { id, deletedAt: { not: null } }, select: { id: true } });
  if (!item) {
    throw new NotFoundException(
      "Este item não está mais na lixeira. Atualize a página.",
      kind === "task" ? ErrorCode.TASK_NOT_FOUND : ErrorCode.MATERIAL_NOT_FOUND,
    );
  }
}

export async function RestoreTrashItemService(kind: TrashKind, id: string) {
  await findTrashed(kind, id);
  if (kind === "task") return prisma.task.update({ where: { id }, data: { deletedAt: null } });
  return prisma.material.update({ where: { id }, data: { deletedAt: null } });
}

/** Apaga do banco e do Storage. Anexos de uma tarefa saem junto com ela. */
async function destroy(where: { taskIds: string[]; materialIds: string[] }) {
  const materials = await prisma.material.findMany({
    where: { OR: [{ id: { in: where.materialIds } }, { taskId: { in: where.taskIds } }] },
    select: { id: true, storagePath: true },
  });
  await prisma.$transaction([
    prisma.material.deleteMany({ where: { id: { in: materials.map((m) => m.id) } } }),
    prisma.task.deleteMany({ where: { id: { in: where.taskIds } } }),
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
  return destroy(kind === "task" ? { taskIds: [id], materialIds: [] } : { taskIds: [], materialIds: [id] });
}

/** Cron diário: apaga de vez o que está na lixeira há mais de 30 dias. */
export async function PurgeExpiredTrashService(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const [tasks, materials] = await Promise.all([
    prisma.task.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } }),
    prisma.material.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } }),
  ]);
  if (tasks.length === 0 && materials.length === 0) return { tasks: 0, materials: 0 };
  return destroy({ taskIds: tasks.map((t) => t.id), materialIds: materials.map((m) => m.id) });
}
