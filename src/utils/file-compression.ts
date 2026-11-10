import crypto from "node:crypto";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

const MAX_IMAGE_SIDE = 2560;
const THUMBNAIL_SIDE = 320;
// PDF regravado só substitui o original se encolher pelo menos 5%.
const PDF_MIN_GAIN = 0.05;

export const sha256 = (data: Buffer) => crypto.createHash("sha256").update(data).digest("hex");

const isImage = (fileName: string) => /\.(png|jpe?g)$/i.test(fileName);

export type CompressedFile = { data: Buffer; fileName: string; mimeType?: string };

/** Devolve o próprio `data` quando não há ganho ou o arquivo não pode ser regravado. */
export async function compressFile(data: Buffer, fileName: string): Promise<CompressedFile> {
  try {
    if (isImage(fileName)) {
      const webp = await sharp(data)
        .rotate()
        .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      if (webp.length < data.length) {
        return { data: webp, fileName: fileName.replace(/\.[^.]+$/, ".webp"), mimeType: "image/webp" };
      }
    } else if (/\.pdf$/i.test(fileName) && !data.includes("/ByteRange")) {
      // /ByteRange marca assinatura digital: regravar o arquivo a invalidaria.
      const document = await PDFDocument.load(data, { updateMetadata: false });
      const saved = Buffer.from(await document.save({ useObjectStreams: true }));
      if (saved.length <= data.length * (1 - PDF_MIN_GAIN)) return { data: saved, fileName };
    }
  } catch {
    // Arquivo corrompido, protegido por senha ou fora do padrão: fica como chegou.
  }
  return { data, fileName };
}

export async function makeThumbnail(data: Buffer, fileName: string): Promise<Buffer | null> {
  if (!isImage(fileName)) return null;
  try {
    return await sharp(data)
      .rotate()
      .resize({ width: THUMBNAIL_SIDE, height: THUMBNAIL_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
  } catch {
    return null;
  }
}
