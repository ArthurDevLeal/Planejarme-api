type TreeFolder = { id: string; parentId: string | null };

/** A pasta e tudo o que está dentro dela. */
export function collectSubtree(folders: TreeFolder[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parentId) continue;
    childrenOf.set(folder.parentId, [...(childrenOf.get(folder.parentId) ?? []), folder.id]);
  }
  const found = new Set<string>();
  const pending = [rootId];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (found.has(id)) continue;
    found.add(id);
    pending.push(...(childrenOf.get(id) ?? []));
  }
  return found;
}

/** Caminho da raiz até a pasta, parando em `stopAtId` (incluído) quando informado. */
export function buildFolderPath<T extends TreeFolder>(folders: T[], folderId: string, stopAtId?: string): T[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: T[] = [];
  const seen = new Set<string>();
  let current = byId.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    if (current.id === stopAtId) break;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}
