import mammoth from "mammoth";
import { extractText } from "unpdf";
import { prisma } from "../../lib/prisma.ts";
import { BadRequestsException } from "../exceptions/bad-requests.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode, HttpException } from "../exceptions/root.ts";
import { supabase, SUPABASE_STORAGE_BUCKET } from "../lib/supabase.ts";

type MaterialForText = {
  id: string;
  title: string;
  mimeType: string | null;
  storagePath: string | null;
  textContent: string | null;
  textExtractedAt: Date | null;
};

function kindOf(material: MaterialForText): "pdf" | "docx" | "txt" | null {
  const mime = material.mimeType ?? "";
  const name = (material.storagePath ?? material.title).toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.endsWith(".docx")) return "docx";
  if (mime.startsWith("text/plain") || name.endsWith(".txt")) return "txt";
  return null;
}

const normalize = (text: string) => text.replace(/[ \t\f\v ]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n").trim();

/** Extrai uma vez e guarda. Texto vazio = "sem texto legível" (PDF escaneado, imagem, planilha, link): não tenta de novo. */
export async function ensureMaterialText(material: MaterialForText): Promise<string> {
  if (material.textExtractedAt) return material.textContent ?? "";
  const kind = kindOf(material);
  let text = "";
  if (kind && material.storagePath) {
    const { data: blob, error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).download(material.storagePath);
    // Falha de rede/Storage não marca o material: a próxima tentativa extrai de novo.
    if (error || !blob) throw error ?? new Error("Arquivo não encontrado no Storage.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    try {
      if (kind === "pdf") text = (await extractText(bytes, { mergePages: true })).text;
      else if (kind === "docx") text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
      else text = new TextDecoder("utf-8").decode(bytes);
    } catch {
      text = ""; // arquivo corrompido ou protegido: fica como sem texto legível
    }
  }
  text = normalize(text);
  await prisma.material.update({ where: { id: material.id }, data: { textContent: text, textExtractedAt: new Date() } });
  return text;
}

/**
 * Materiais escolhidos (ou todos da disciplina) com o texto extraído. Erros prontos para a API:
 * 404 material alheio, 503 falha de leitura, 400 sem material/sem texto (com a frase do plano gratuito quando não há arquivos).
 */
export async function gatherMaterialText(
  userId: string,
  disciplineId: string,
  materialIds: string[] | undefined,
  messages: { freeNoMaterials: boolean; freeMessage: string; noTextMessage: string },
) {
  const select = { id: true, title: true, mimeType: true, storagePath: true, textContent: true, textExtractedAt: true };
  let materials;
  if (materialIds) {
    const ids = [...new Set(materialIds)];
    const found = await prisma.material.findMany({
      where: { id: { in: ids }, deletedAt: null, OR: [{ userId }, { userId: null, discipline: { userId } }] },
      select,
    });
    if (found.length !== ids.length) throw new NotFoundException("Um dos materiais escolhidos não foi encontrado.", ErrorCode.MATERIAL_NOT_FOUND);
    materials = ids.map((id) => found.find((material) => material.id === id)!);
  } else {
    // A disciplina já foi conferida no controller: os materiais dela são do usuário.
    materials = await prisma.material.findMany({ where: { disciplineId, deletedAt: null }, select, orderBy: { createdAt: "asc" } });
  }

  const withText: { id: string; title: string; text: string }[] = [];
  for (const material of materials) {
    let text: string;
    try {
      text = await ensureMaterialText(material);
    } catch {
      throw new HttpException(`Não foi possível ler o material "${material.title}" agora. Tente de novo em instantes.`, ErrorCode.SERVICE_UNAVAILABLE, 503);
    }
    if (text) withText.push({ id: material.id, title: material.title, text });
  }
  if (withText.length === 0) {
    // Gratuito não envia arquivos: não mandar fazer o que o plano não deixa.
    if (materials.length === 0 && messages.freeNoMaterials) throw new BadRequestsException(messages.freeMessage, ErrorCode.INVALID_DATA);
    throw new BadRequestsException(messages.noTextMessage, ErrorCode.INVALID_DATA);
  }
  return withText;
}
