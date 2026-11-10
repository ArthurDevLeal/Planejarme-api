import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.ts";
import { BadRequestsException } from "../exceptions/bad-requests.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { supabase, SUPABASE_STORAGE_BUCKET } from "../lib/supabase.ts";
import { FinalizeUploadSchemaType, UploadUrlSchemaType } from "../schemas/material-schema.ts";
import { compressFile, makeThumbnail, sha256 } from "../utils/file-compression.ts";
import { CreateMaterialService } from "./material-service.ts";
import { assertFileSize, assertStorageRoom } from "./plan-service.ts";
import { ReleaseStorageObjects } from "./storage-service.ts";

// RN15: só as extensões do MVP (.doc mantido porque o web já aceitava).
const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx", ".xlsx", ".pptx", ".txt"];

const bucket = () => supabase.storage.from(SUPABASE_STORAGE_BUCKET);
const invalid = (message: string, cause?: unknown) => new BadRequestsException(message, ErrorCode.INVALID_DATA, cause);

function assertAllowedExtension(fileName: string) {
  const name = fileName.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    throw invalid("Tipo de arquivo não aceito. Envie PDF, imagem (PNG/JPG), Word, Excel, PowerPoint ou TXT, ou salve um link.");
  }
}

function sanitizeFilename(filename: string): string {
  return filename
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

const newPath = (userId: string, fileName: string) => `${userId}/${crypto.randomUUID()}-${sanitizeFilename(fileName)}`;

/**
 * O arquivo vai do navegador direto para o Storage: o corpo de uma requisição à API (Vercel) não passa de ~4,5 MB.
 * Aqui só se confere o que dá para saber antes do envio; o tamanho real é conferido em FinalizeUploadService.
 */
export async function CreateUploadUrlService(userId: string, data: UploadUrlSchemaType) {
  assertAllowedExtension(data.fileName);
  await assertFileSize(userId, data.sizeBytes);
  // A compressão pode fazer caber um arquivo que hoje não caberia, então aqui só barra quem já está sem espaço.
  await assertStorageRoom(userId, 0);

  const path = newPath(userId, data.fileName);
  const { data: signed, error } = await bucket().createSignedUploadUrl(path);
  if (error) throw invalid("Não foi possível iniciar o envio do arquivo. Tente novamente.", error);
  return { path, signedUrl: signed.signedUrl };
}

export async function FinalizeUploadService(userId: string, data: FinalizeUploadSchemaType) {
  // O caminho vem do cliente: só vale dentro da pasta do próprio usuário e se ainda não virou material.
  if (!data.path.startsWith(`${userId}/`) || !/^\/[0-9a-f-]{36}-[A-Za-z0-9._-]+$/.test(data.path.slice(userId.length))) {
    throw invalid("Envio inválido. Envie o arquivo novamente.");
  }
  if (await prisma.material.findFirst({ where: { OR: [{ storagePath: data.path }, { thumbnailPath: data.path }] }, select: { id: true } })) {
    throw invalid("Este envio já foi concluído.");
  }
  const { data: info, error: infoError } = await bucket().info(data.path);
  if (infoError || !info) throw invalid("Arquivo não encontrado. Envie novamente.", infoError);

  const storedName = data.path.slice(userId.length + 38);
  const originalName = data.fileName?.trim() || storedName;
  let uploaded: string[] = [];
  try {
    assertAllowedExtension(storedName);
    // Antes de baixar: quem burlou o limite no navegador não ocupa a memória da função.
    await assertFileSize(userId, info.size ?? 0);

    const { data: blob, error: downloadError } = await bucket().download(data.path);
    if (downloadError || !blob) throw invalid("Não foi possível ler o arquivo enviado. Envie novamente.", downloadError);
    const original = Buffer.from(await blob.arrayBuffer());
    const hash = sha256(original);

    const twin = await prisma.material.findFirst({
      where: { userId, sha256: hash, storagePath: { not: null } },
      select: { storagePath: true, sizeBytes: true, originalSizeBytes: true, mimeType: true, type: true, thumbnailPath: true, thumbnailBytes: true },
    });

    let file: { storagePath: string; sizeBytes: number; mimeType: string | null; type: string; thumbnailPath: string | null; thumbnailBytes: number | null };
    let title = data.title?.trim() || originalName;
    const extension = (name: string) => (name.includes(".") ? name.split(".").pop()!.toUpperCase() : "FILE");

    if (twin?.storagePath) {
      // Mesmo arquivo do mesmo usuário: a linha nova aponta para o objeto que já existe.
      file = { storagePath: twin.storagePath, sizeBytes: twin.sizeBytes ?? original.length, mimeType: twin.mimeType, type: twin.type, thumbnailPath: twin.thumbnailPath, thumbnailBytes: twin.thumbnailBytes };
    } else {
      const compressed = await compressFile(original, storedName);
      const thumbnail = await makeThumbnail(original, storedName);
      await assertStorageRoom(userId, compressed.data.length + (thumbnail?.length ?? 0));

      let storagePath = data.path;
      if (compressed.data !== original) {
        storagePath = newPath(userId, compressed.fileName);
        const { error } = await bucket().upload(storagePath, compressed.data, { contentType: compressed.mimeType ?? info.contentType });
        if (error) throw invalid("Não foi possível salvar o arquivo. Tente novamente.", error);
        uploaded.push(storagePath);
      }
      let thumbnailPath: string | null = null;
      if (thumbnail) {
        thumbnailPath = `${userId}/thumb-${crypto.randomUUID()}.webp`;
        const { error } = await bucket().upload(thumbnailPath, thumbnail, { contentType: "image/webp" });
        // Miniatura é enfeite: sem ela o arquivo continua valendo.
        if (error) thumbnailPath = null;
        else uploaded.push(thumbnailPath);
      }
      file = {
        storagePath,
        sizeBytes: compressed.data.length,
        mimeType: compressed.mimeType ?? info.contentType ?? null,
        type: extension(compressed.fileName),
        thumbnailPath,
        thumbnailBytes: thumbnailPath ? thumbnail!.length : null,
      };
    }
    // A imagem virou WebP: o nome exibido acompanha, senão o download sairia com a extensão errada.
    if (file.type === "WEBP" && /\.(png|jpe?g)$/i.test(title)) title = title.replace(/\.[^.]+$/, ".webp");

    const material = await CreateMaterialService({
      title,
      type: file.type,
      url: "",
      fileSizeMb: Number((file.sizeBytes / (1024 * 1024)).toFixed(2)),
      mimeType: file.mimeType ?? undefined,
      storagePath: file.storagePath,
      sizeBytes: file.sizeBytes,
      originalSizeBytes: original.length,
      sha256: hash,
      thumbnailPath: file.thumbnailPath,
      thumbnailBytes: file.thumbnailBytes,
      userId,
      disciplineId: data.disciplineId,
      taskId: data.taskId,
      folderId: data.folderId,
    });
    uploaded = [];
    return material;
  } finally {
    // Tudo que subiu e não ficou referenciado sai: o envio original trocado pela versão comprimida, a cópia repetida ou os restos de um erro.
    await ReleaseStorageObjects([data.path, ...uploaded]).catch((error) => console.error("[upload] limpeza falhou", error));
  }
}
