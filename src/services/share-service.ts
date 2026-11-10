import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.ts";
import { BadRequestsException } from "../exceptions/bad-requests.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { SendEmail } from "../lib/email.ts";
import { supabase, SUPABASE_STORAGE_BUCKET } from "../lib/supabase.ts";
import { ShareExpiry, ShareTarget } from "../schemas/share-schema.ts";
import { buildFolderPath, collectSubtree } from "../utils/folder-tree.ts";

const EXPIRY_MS: Record<ShareExpiry, number> = {
  "1h": 3_600_000,
  "1d": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};
const SIGNED_URL_SECONDS = 600;
const LINK_TYPES = ["LINK", "SHORTCUT"];

const targetInclude = {
  material: { select: { id: true, title: true, type: true, mimeType: true, fileSizeMb: true, createdAt: true, url: true, storagePath: true, userId: true } },
  folder: { select: { id: true, name: true } },
  discipline: { select: { id: true, name: true } },
} as const;

type TargetRow = {
  ownerId: string;
  materialId: string | null;
  folderId: string | null;
  disciplineId: string | null;
  material: { id: string; title: string } | null;
  folder: { id: string; name: string } | null;
  discipline: { id: string; name: string } | null;
};

function targetOf(row: TargetRow): ShareTarget & { name: string } {
  if (row.material) return { kind: "material", id: row.material.id, name: row.material.title };
  if (row.folder) return { kind: "folder", id: row.folder.id, name: row.folder.name };
  return { kind: "discipline", id: row.disciplineId!, name: row.discipline?.name ?? "" };
}

const targetWhere = (target: ShareTarget) => ({ [`${target.kind}Id`]: target.id });
const targetData = (target: ShareTarget) => ({ materialId: null, folderId: null, disciplineId: null, ...targetWhere(target) });

async function assertOwnTarget(userId: string, target: ShareTarget) {
  const notFound = () => new NotFoundException("Item não encontrado. Atualize a página.", ErrorCode.NOT_FOUND);
  if (target.kind === "folder") {
    const folder = await prisma.folder.findFirst({ where: { id: target.id, userId, deletedAt: null }, select: { name: true } });
    if (!folder) throw notFound();
    return folder.name;
  }
  if (target.kind === "discipline") {
    const discipline = await prisma.discipline.findFirst({ where: { id: target.id, userId }, select: { name: true } });
    if (!discipline) throw notFound();
    return discipline.name;
  }
  const material = await prisma.material.findFirst({
    where: { id: target.id, deletedAt: null, OR: [{ userId }, { discipline: { userId } }] },
    select: { title: true, type: true },
  });
  if (!material) throw notFound();
  if (LINK_TYPES.includes(material.type.toUpperCase())) {
    throw new BadRequestsException("Atalhos não podem ser compartilhados.", ErrorCode.INVALID_DATA);
  }
  return material.title;
}

export async function UpsertShareLinkService(userId: string, target: ShareTarget, expiresIn: ShareExpiry) {
  await assertOwnTarget(userId, target);
  const expiresAt = new Date(Date.now() + EXPIRY_MS[expiresIn]);
  const existing = await prisma.shareLink.findFirst({ where: { ownerId: userId, ...targetWhere(target) } });
  if (existing && existing.expiresAt.getTime() > Date.now()) {
    return prisma.shareLink.update({ where: { id: existing.id }, data: { expiresAt } });
  }
  if (existing) await prisma.shareLink.delete({ where: { id: existing.id } });
  return prisma.shareLink.create({
    data: { token: crypto.randomBytes(24).toString("base64url"), expiresAt, ownerId: userId, ...targetData(target) },
  });
}

export async function RevokeShareLinkService(userId: string, id: string) {
  const { count } = await prisma.shareLink.deleteMany({ where: { id, ownerId: userId } });
  if (count === 0) throw new NotFoundException("Este link já foi revogado.", ErrorCode.NOT_FOUND);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export async function CreateShareInviteService(userId: string, target: ShareTarget, email: string) {
  const name = await assertOwnTarget(userId, target);
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } });
  if (owner.email.toLowerCase() === email) {
    throw new BadRequestsException("Este item já é seu. Informe o e-mail de outra pessoa.", ErrorCode.INVALID_DATA);
  }

  const where = { email, ...targetWhere(target) };
  const existing = await prisma.shareInvite.findFirst({ where });
  if (existing) return existing;
  const invite = await prisma.shareInvite.create({ data: { email, ownerId: userId, ...targetData(target) } });

  const message = `${owner.name} compartilhou "${name}" com você no Planejar.me.`;
  const recipient = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  if (recipient) {
    await prisma.notification.create({ data: { userId: recipient.id, title: "Novo item compartilhado", message, type: "SHARE" } });
  }

  const webUrl = (process.env.WEB_URL || "http://localhost:3000").replace(/\/$/, "");
  const link = `${webUrl}/dashboard/arquivos/compartilhados`;
  await SendEmail({
    to: email,
    subject: `${owner.name} compartilhou um item com você`,
    text: `${message}\n\nPara abrir, entre ou crie sua conta com este e-mail:\n\n${link}`,
    html: `<p>${escapeHtml(message)}</p><p>Para abrir, entre ou crie sua conta com este e-mail.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#2563eb;color:#fff;text-decoration:none">Ver item compartilhado</a></p>`,
  }).catch((error) => console.error("[share] falha ao enviar convite", error));

  return invite;
}

export async function RevokeShareInviteService(userId: string, id: string) {
  const { count } = await prisma.shareInvite.deleteMany({ where: { id, ownerId: userId } });
  if (count === 0) throw new NotFoundException("Este convite já foi removido.", ErrorCode.NOT_FOUND);
}

export async function FindSharesByOwnerService(userId: string) {
  const [links, invites] = await Promise.all([
    prisma.shareLink.findMany({ where: { ownerId: userId }, include: targetInclude, orderBy: { createdAt: "desc" } }),
    prisma.shareInvite.findMany({ where: { ownerId: userId }, include: targetInclude, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    links: links.map((link) => ({ id: link.id, token: link.token, expiresAt: link.expiresAt, createdAt: link.createdAt, target: targetOf(link) })),
    invites: invites.map((invite) => ({ id: invite.id, email: invite.email, createdAt: invite.createdAt, target: targetOf(invite) })),
  };
}

const recipientWhere = (email: string) => ({ email: { equals: email, mode: "insensitive" as const } });

async function recipientEmail(userId: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } })).email;
}

export async function FindSharesReceivedService(userId: string) {
  const invites = await prisma.shareInvite.findMany({
    where: recipientWhere(await recipientEmail(userId)),
    include: { ...targetInclude, owner: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return invites.map((invite) => ({ id: invite.id, ownerName: invite.owner.name, createdAt: invite.createdAt, target: targetOf(invite) }));
}

async function findReceivedInvite(userId: string, id: string) {
  const invite = await prisma.shareInvite.findFirst({
    where: { id, ...recipientWhere(await recipientEmail(userId)) },
    include: targetInclude,
  });
  if (!invite) throw new NotFoundException("Este compartilhamento não está mais disponível.", ErrorCode.NOT_FOUND);
  return invite;
}

export async function LeaveShareService(userId: string, id: string) {
  const invite = await findReceivedInvite(userId, id);
  await prisma.shareInvite.delete({ where: { id: invite.id } });
}

type ListedMaterial = { id: string; title: string; type: string; mimeType: string | null; fileSizeMb: number | null; createdAt: Date; url: string; storagePath: string | null };

const toFile = (material: ListedMaterial) => ({
  id: material.id,
  title: material.title,
  type: material.type,
  mimeType: material.mimeType,
  fileSizeMb: material.fileSizeMb,
  createdAt: material.createdAt,
  // O caminho no Storage nunca sai daqui: só o dono o conhece.
  isUpload: Boolean(material.storagePath),
});

const unavailable = () => new NotFoundException("Este conteúdo não está mais disponível.", ErrorCode.NOT_FOUND);

async function reachableFolders(row: TargetRow) {
  const folders = await prisma.folder.findMany({
    where: { userId: row.ownerId, deletedAt: null },
    select: { id: true, name: true, parentId: true, disciplineId: true },
    orderBy: { name: "asc" },
  });
  if (row.folderId) {
    const subtree = collectSubtree(folders, row.folderId);
    return folders.filter((folder) => subtree.has(folder.id));
  }
  return row.disciplineId ? folders.filter((folder) => folder.disciplineId === row.disciplineId) : [];
}

const visibleFile = { deletedAt: null, type: { notIn: LINK_TYPES } };

async function readContent(row: TargetRow, ownerName: string, expiresAt: Date | null, folderId?: string) {
  const target = targetOf(row);
  const base = { name: target.name, kind: target.kind, ownerName, expiresAt };

  if (row.material) {
    if (folderId) throw unavailable();
    const material = await prisma.material.findFirst({ where: { id: row.material.id, ...visibleFile } });
    if (!material) throw unavailable();
    return { ...base, path: [], folders: [], files: [toFile(material)] };
  }

  const folders = await reachableFolders(row);
  const currentId = folderId ?? row.folderId;
  if (folderId && !folders.some((folder) => folder.id === folderId)) throw unavailable();

  const files = await prisma.material.findMany({
    where: { ...visibleFile, ...(currentId ? { folderId: currentId } : { disciplineId: row.disciplineId, folderId: null }) },
    orderBy: { createdAt: "desc" },
  });
  const atRoot = currentId === row.folderId || !currentId;
  const path = !folderId || atRoot ? [] : buildFolderPath(folders, folderId, row.folderId ?? undefined).filter((folder) => folder.id !== row.folderId);

  return {
    ...base,
    path: path.map((folder) => ({ id: folder.id, name: folder.name })),
    folders: folders
      .filter((folder) => (currentId ? folder.parentId === currentId : folder.parentId === null))
      .map((folder) => ({ id: folder.id, name: folder.name })),
    files: files.map(toFile),
  };
}

async function signFile(row: TargetRow, materialId: string) {
  const material = await prisma.material.findFirst({ where: { id: materialId, ...visibleFile } });
  if (!material) throw unavailable();

  const folders = row.material ? [] : await reachableFolders(row);
  const insideFolder = material.folderId !== null && folders.some((folder) => folder.id === material.folderId);
  const allowed = row.materialId ? row.materialId === material.id : insideFolder || (row.disciplineId !== null && material.disciplineId === row.disciplineId && material.folderId === null);
  if (!allowed) throw unavailable();

  if (!material.storagePath) {
    if (!material.url) throw unavailable();
    return { url: material.url };
  }
  const { data, error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).createSignedUrl(material.storagePath, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw unavailable();
  return { url: data.signedUrl };
}

const firstName = (name: string) => name.trim().split(/\s+/)[0];

async function findLiveLink(token: string) {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { ...targetInclude, owner: { select: { name: true } } },
  });
  if (!link || link.expiresAt.getTime() <= Date.now()) {
    throw new NotFoundException("Este link não existe mais ou expirou.", ErrorCode.NOT_FOUND);
  }
  return link;
}

export async function ReadPublicShareService(token: string, folderId?: string) {
  const link = await findLiveLink(token);
  return readContent(link, firstName(link.owner.name), link.expiresAt, folderId);
}

export async function SignPublicShareFileService(token: string, materialId: string) {
  return signFile(await findLiveLink(token), materialId);
}

export async function ReadReceivedShareService(userId: string, id: string, folderId?: string) {
  const invite = await findReceivedInvite(userId, id);
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: invite.ownerId }, select: { name: true } });
  return readContent(invite, owner.name, null, folderId);
}

export async function SignReceivedShareFileService(userId: string, id: string, materialId: string) {
  return signFile(await findReceivedInvite(userId, id), materialId);
}
