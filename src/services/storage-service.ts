import { prisma } from "../../lib/prisma.ts";
import { supabase, SUPABASE_STORAGE_BUCKET } from "../lib/supabase.ts";

const bucket = () => supabase.storage.from(SUPABASE_STORAGE_BUCKET);
// Upload por URL assinada pode estar em andamento: objeto novo sem linha no banco ainda não é lixo.
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const PAGE = 1000;

/** Dos caminhos dados, os que nenhuma linha de Material usa (ativa ou na lixeira). */
export async function findUnreferenced(paths: string[]) {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return [];
  const rows = await prisma.material.findMany({
    where: { OR: [{ storagePath: { in: unique } }, { thumbnailPath: { in: unique } }] },
    select: { storagePath: true, thumbnailPath: true },
  });
  const used = new Set(rows.flatMap((row) => [row.storagePath, row.thumbnailPath]));
  return unique.filter((path) => !used.has(path));
}

/** Remove do Storage o que ficou sem referência. O que falhar entra na fila que o cron repete. */
export async function ReleaseStorageObjects(paths: (string | null | undefined)[]) {
  const free = await findUnreferenced(paths.filter((path): path is string => Boolean(path)));
  if (free.length === 0) return { removed: 0, queued: 0 };
  const { error } = await bucket().remove(free);
  if (!error) return { removed: free.length, queued: 0 };
  console.error("[storage] remoção falhou, vai para a fila", free.length, error.message);
  await prisma.storageDeletion.createMany({ data: free.map((path) => ({ path, lastError: error.message })), skipDuplicates: true });
  return { removed: 0, queued: free.length };
}

export async function RetryStorageDeletionsService() {
  const pending = await prisma.storageDeletion.findMany({ take: PAGE, orderBy: { createdAt: "asc" }, select: { path: true } });
  if (pending.length === 0) return { removed: 0, failed: 0 };
  const paths = pending.map((item) => item.path);
  const free = await findUnreferenced(paths);
  const { error } = free.length > 0 ? await bucket().remove(free) : { error: null };
  if (error) {
    await prisma.storageDeletion.updateMany({ where: { path: { in: paths } }, data: { attempts: { increment: 1 }, lastError: error.message } });
    return { removed: 0, failed: paths.length };
  }
  await prisma.storageDeletion.deleteMany({ where: { path: { in: paths } } });
  return { removed: free.length, failed: 0 };
}

async function listFiles(prefix: string): Promise<{ path: string; createdAt: number }[]> {
  const files: { path: string; createdAt: number }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket().list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`[storage] não foi possível listar ${prefix}: ${error.message}`);
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      // Pasta vem sem id.
      if (entry.id === null) files.push(...(await listFiles(path)));
      // Sem data de criação não dá para saber se o envio ainda está em andamento: fica fora da limpeza.
      else files.push({ path, createdAt: entry.created_at ? Date.parse(entry.created_at) : Infinity });
    }
    if (data.length < PAGE) return files;
  }
}

/**
 * Varre o bucket atrás de objetos sem linha no banco. Só olha pastas de usuários que existem
 * neste banco: um bucket compartilhado com outro ambiente não perde arquivos por engano.
 */
export async function SweepOrphanObjectsService({ dryRun = false, now = new Date(), onlyUserId }: { dryRun?: boolean; now?: Date; onlyUserId?: string } = {}) {
  // shortcut: percorre todos os usuários numa execução só; com muitas contas, paginar por dia e guardar o cursor.
  const users = await prisma.user.findMany({ where: { id: onlyUserId }, select: { id: true } });
  let scanned = 0;
  let orphans = 0;
  let removed = 0;
  for (const { id } of users) {
    const files = await listFiles(id);
    scanned += files.length;
    const old = files.filter((file) => now.getTime() - file.createdAt > ORPHAN_GRACE_MS).map((file) => file.path);
    const free = await findUnreferenced(old);
    orphans += free.length;
    if (!dryRun && free.length > 0) removed += (await ReleaseStorageObjects(free)).removed;
  }
  return { scanned, orphans, removed };
}
