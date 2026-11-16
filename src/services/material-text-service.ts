import mammoth from "mammoth";
import { extractText } from "unpdf";
import { prisma } from "../../lib/prisma.ts";
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
