import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { prisma } from "../lib/prisma.ts";
import { PLANS } from "../src/config/plans.ts";
import { supabase, SUPABASE_STORAGE_BUCKET } from "../src/lib/supabase.ts";
import { ErrorMiddleware } from "../src/middlewares/errors.ts";
import { mainRouter } from "../src/routes/main-router.ts";
import { ReleaseStorageObjects, RetryStorageDeletionsService, SweepOrphanObjectsService } from "../src/services/storage-service.ts";
import { compressFile, makeThumbnail, sha256 } from "../src/utils/file-compression.ts";

const dbTest = { skip: process.env.RUN_DB_TESTS !== "1" };
let server: Server;
let baseUrl = "";

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(mainRouter);
  app.use(ErrorMiddleware);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

// Foto sintética: ruído suave sobre um degradê, grande o bastante para precisar de redimensionamento.
async function photoPng(width = 3200, height = 1800) {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 3) {
    const x = (i / 3) % width;
    raw[i] = (x * 255) / width;
    raw[i + 1] = (i / 3 / width / height) * 255;
    raw[i + 2] = 120 + ((i * 7919) % 23);
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function plainPdf(pages = 40) {
  const document = await PDFDocument.create();
  for (let i = 0; i < pages; i++) document.addPage([595, 842]).drawText(`Página ${i + 1} do resumo de Cálculo`, { x: 50, y: 780, size: 14 });
  return Buffer.from(await document.save({ useObjectStreams: false }));
}

test("hash: mesmo conteúdo dá o mesmo SHA-256, conteúdo diferente não", () => {
  assert.equal(sha256(Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.notEqual(sha256(Buffer.from("abc")), sha256(Buffer.from("abd")));
});

test("compressão: imagem vira WebP com lado máximo de 2560 px e gera miniatura", async () => {
  const original = await photoPng();
  const compressed = await compressFile(original, "foto da lousa.png");
  assert.equal(compressed.fileName, "foto da lousa.webp");
  assert.equal(compressed.mimeType, "image/webp");
  assert.ok(compressed.data.length < original.length);
  const meta = await sharp(compressed.data).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 2560);
  assert.equal(meta.height, 1440);

  const thumbnail = await makeThumbnail(original, "foto da lousa.png");
  assert.ok(thumbnail);
  assert.equal((await sharp(thumbnail).metadata()).width, 320);
  assert.equal(await makeThumbnail(Buffer.from("texto"), "notas.txt"), null);
});

test("compressão: PDF só é regravado com ganho de 5% ou mais; assinado e outros tipos ficam intactos", async () => {
  const pdf = await plainPdf();
  const compressed = await compressFile(pdf, "resumo.pdf");
  assert.ok(compressed.data.length <= pdf.length * 0.95, `ganho insuficiente: ${pdf.length} -> ${compressed.data.length}`);
  assert.equal((await PDFDocument.load(compressed.data)).getPageCount(), 40);

  // Já otimizado: regravar não rende 5%, então o original é devolvido (mesmo Buffer).
  assert.equal((await compressFile(compressed.data, "resumo.pdf")).data, compressed.data);

  const signed = Buffer.concat([pdf, Buffer.from("\n% /ByteRange [0 1 2 3]")]);
  assert.equal((await compressFile(signed, "contrato.pdf")).data, signed);

  const text = Buffer.from("anotações");
  assert.equal((await compressFile(text, "notas.txt")).data, text);
  const broken = Buffer.from("isto não é uma imagem");
  assert.equal((await compressFile(broken, "quebrada.png")).data, broken);
  assert.equal(await makeThumbnail(broken, "quebrada.png"), null);
});

test("upload-url: recusa sem autenticação e arquivo acima do limite do plano", async () => {
  assert.equal((await fetch(`${baseUrl}/materials/upload-url`, { method: "POST" })).status, 401);
  const token = jwt.sign({ id: randomUUID() }, process.env.JWT_SECRET || "test-secret", { expiresIn: "5m" });
  const response = await fetch(`${baseUrl}/materials/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fileName: "apostila.pdf", sizeBytes: PLANS.FREE.maxFileBytes + 1 }),
  });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.errorCode, "PLAN_LIMIT_REACHED");
  assert.match(body.message, /upgrade/i);
});

test("armazenamento: envio, dedup, contagem de referências, cota, limite de disciplinas, lixeira da disciplina e limpeza", dbTest, async () => {
  const [owner, stranger] = await Promise.all(
    ["Dono", "Outro"].map((name) =>
      prisma.user.create({ data: { name: `${name} storage`, email: `storage-${randomUUID()}@example.invalid`, passwordHash: "x" } }),
    ),
  );
  const tokenFor = (id: string) => jwt.sign({ id }, process.env.JWT_SECRET || "test-secret", { expiresIn: "5m" });
  const bucket = supabase.storage.from(SUPABASE_STORAGE_BUCKET);
  const exists = async (path: string) => !(await bucket.info(path)).error;
  const limits = { ...PLANS.FREE };

  async function call(path: string, method = "GET", input?: unknown, as = owner.id) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenFor(as)}` },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
  }
  async function send(data: Buffer, fileName: string, extra: object = {}, as = owner.id) {
    const url = await call("/materials/upload-url", "POST", { fileName, sizeBytes: data.length }, as);
    if (url.status !== 201) return url;
    const contentType = fileName.endsWith(".png") ? "image/png" : "text/plain";
    const put = await fetch(url.body.data.signedUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: new Uint8Array(data) });
    assert.ok(put.ok, `envio direto ao Storage falhou: ${put.status} ${put.ok ? "" : await put.text()}`);
    return call("/materials/upload", "POST", { path: url.body.data.path, fileName, ...extra }, as);
  }

  try {
    const photo = await photoPng(1600, 900);

    // Envio com compressão: o objeto guardado é o WebP, o PNG original sai do Storage.
    const first = await send(photo, "Lousa de Física #1.png");
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const a = first.body.data;
    assert.equal(a.title, "Lousa de Física #1.webp");
    assert.equal(a.type, "WEBP");
    assert.equal(a.mimeType, "image/webp");
    assert.equal(a.originalSizeBytes, photo.length);
    assert.ok(a.sizeBytes < photo.length);
    assert.equal(a.sha256, sha256(photo));
    assert.match(a.storagePath, new RegExp(`^${owner.id}/[0-9a-f-]{36}-Lousa_de_Fisica__1\\.webp$`));
    assert.ok(a.thumbnailPath && (await exists(a.thumbnailPath)));
    assert.ok(await exists(a.storagePath));
    const leftovers = (await bucket.list(owner.id)).data!.map((entry) => entry.name);
    assert.equal(leftovers.length, 2, `sobrou o envio original: ${leftovers}`);

    // Concluir duas vezes o mesmo envio, ou o envio de outra pessoa, não cria material.
    assert.equal((await call("/materials/upload", "POST", { path: a.storagePath })).status, 400);
    assert.equal((await call("/materials/upload", "POST", { path: a.storagePath }, stranger.id)).status, 400);

    const list = await call("/materials/user/me");
    assert.ok(list.body.data.find((m: { id: string }) => m.id === a.id).thumbnailUrl.startsWith("http"));

    // Dedup: mesmo arquivo, mesmo usuário → mesma linha de Storage, nenhum byte novo na cota.
    const usageBefore = (await call("/users/me/usage")).body.data;
    assert.equal(usageBefore.plan, "FREE");
    assert.equal(usageBefore.usedBytes, a.sizeBytes + a.thumbnailBytes);
    assert.equal(usageBefore.savedBytes, photo.length - a.sizeBytes);
    const second = await send(photo, "cópia.png");
    assert.equal(second.status, 201);
    const b = second.body.data;
    assert.notEqual(b.id, a.id);
    assert.equal(b.storagePath, a.storagePath);
    assert.equal(b.thumbnailPath, a.thumbnailPath);
    assert.equal((await call("/users/me/usage")).body.data.usedBytes, usageBefore.usedBytes);
    assert.equal((await bucket.list(owner.id)).data!.length, 2);

    // Nunca entre usuários: outra pessoa com o mesmo arquivo ganha o próprio objeto.
    const other = await send(photo, "Lousa de Física #1.png", {}, stranger.id);
    assert.equal(other.status, 201);
    assert.notEqual(other.body.data.storagePath, a.storagePath);
    assert.ok(other.body.data.storagePath.startsWith(`${stranger.id}/`));

    // Contagem de referências: o objeto só sai quando a última linha (inclusive na lixeira) é apagada de vez.
    await call(`/materials/${a.id}`, "DELETE");
    assert.equal((await call("/users/me/usage")).body.data.usedBytes, usageBefore.usedBytes, "a lixeira conta na cota");
    assert.equal((await call(`/trash/material/${a.id}`, "DELETE")).status, 200);
    assert.ok(await exists(a.storagePath), "a cópia ainda usa o objeto");
    await call(`/materials/${b.id}`, "DELETE");
    assert.equal((await call(`/trash/material/${b.id}`, "DELETE")).status, 200);
    assert.equal(await exists(a.storagePath), false);
    assert.equal(await exists(a.thumbnailPath), false);
    assert.equal((await call("/users/me/usage")).body.data.usedBytes, 0);

    // Cota: quem está no limite não envia, e nada do que já tem é apagado.
    const kept = await send(Buffer.from("anotações da aula"), "notas.txt");
    assert.equal(kept.status, 201);
    PLANS.FREE.storageBytes = 10;
    const blocked = await call("/materials/upload-url", "POST", { fileName: "mais.txt", sizeBytes: 5 });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.errorCode, "PLAN_LIMIT_REACHED");
    assert.match(blocked.body.message, /limite de .* de armazenamento/);
    assert.ok(await prisma.material.findUnique({ where: { id: kept.body.data.id } }));
    // Com espaço para começar, mas não para o arquivo final: o envio é desfeito no Storage.
    PLANS.FREE.storageBytes = kept.body.data.sizeBytes + 5;
    const tooBig = await send(Buffer.from("um texto que não cabe no que sobrou"), "grande.txt");
    assert.equal(tooBig.status, 403);
    assert.equal((await bucket.list(owner.id)).data!.length, 1);
    PLANS.FREE.storageBytes = limits.storageBytes;

    // Limite de disciplinas por semestre.
    PLANS.FREE.maxDisciplinesPerSemester = 1;
    const discipline = await call("/disciplines", "POST", { name: "Física", workloadHours: 60 });
    assert.equal(discipline.status, 201);
    const extra = await call("/disciplines", "POST", { name: "Cálculo", workloadHours: 60 });
    assert.equal(extra.status, 403);
    assert.equal(extra.body.errorCode, "PLAN_LIMIT_REACHED");
    PLANS.FREE.maxDisciplinesPerSemester = limits.maxDisciplinesPerSemester;

    // Apagar a disciplina manda materiais e pastas para a lixeira.
    const disciplineId = discipline.body.data.id;
    const folder = await call("/folders", "POST", { name: "Listas", disciplineId });
    assert.equal(folder.status, 201);
    const inFolder = await send(Buffer.from("lista 1"), "lista1.txt", { folderId: folder.body.data.id });
    const loose = await send(Buffer.from("ementa"), "ementa.txt", { disciplineId });
    assert.equal(inFolder.body.data.disciplineId, disciplineId);
    assert.equal((await call(`/disciplines/${disciplineId}`, "DELETE")).status, 200);
    for (const id of [inFolder.body.data.id, loose.body.data.id]) {
      assert.ok((await prisma.material.findUnique({ where: { id } }))?.deletedAt, "material deveria estar na lixeira");
    }
    const trash = (await call("/trash")).body.data;
    assert.deepEqual(trash.folders.map((f: { id: string }) => f.id), [folder.body.data.id]);
    assert.deepEqual(trash.materials.map((m: { id: string }) => m.id), [loose.body.data.id]);
    assert.ok(await exists(loose.body.data.storagePath));

    // Varredura: objeto antigo sem linha no banco sai; o referenciado e o recém-enviado ficam.
    const orphan = `${owner.id}/${randomUUID()}-orfao.txt`;
    assert.equal((await bucket.upload(orphan, Buffer.from("sem dono"))).error, null);
    const tomorrow = new Date(Date.now() + 36 * 3_600_000);
    assert.deepEqual(await SweepOrphanObjectsService({ onlyUserId: owner.id }), { scanned: 4, orphans: 0, removed: 0 });
    assert.deepEqual(await SweepOrphanObjectsService({ onlyUserId: owner.id, now: tomorrow, dryRun: true }), { scanned: 4, orphans: 1, removed: 0 });
    assert.ok(await exists(orphan));
    assert.deepEqual(await SweepOrphanObjectsService({ onlyUserId: owner.id, now: tomorrow }), { scanned: 4, orphans: 1, removed: 1 });
    assert.equal(await exists(orphan), false);
    assert.ok(await exists(kept.body.data.storagePath));

    // Falha do Storage entra na fila e o cron repete.
    const stuck = `${owner.id}/${randomUUID()}-preso.txt`;
    await bucket.upload(stuck, Buffer.from("preso"));
    const realFrom = supabase.storage.from.bind(supabase.storage);
    (supabase.storage as { from: unknown }).from = () => ({ remove: async () => ({ data: null, error: { message: "Storage fora do ar" } }) });
    try {
      assert.deepEqual(await ReleaseStorageObjects([stuck]), { removed: 0, queued: 1 });
      await RetryStorageDeletionsService();
    } finally {
      (supabase.storage as { from: unknown }).from = realFrom;
    }
    const queued = await prisma.storageDeletion.findUnique({ where: { path: stuck } });
    assert.equal(queued?.attempts, 1);
    assert.equal(queued?.lastError, "Storage fora do ar");
    await RetryStorageDeletionsService();
    assert.equal(await prisma.storageDeletion.findUnique({ where: { path: stuck } }), null);
    assert.equal(await exists(stuck), false);
  } finally {
    Object.assign(PLANS.FREE, limits);
    const paths = [owner.id, stranger.id].map(async (id) => ((await bucket.list(id)).data ?? []).map((entry) => `${id}/${entry.name}`));
    const leftover = (await Promise.all(paths)).flat();
    if (leftover.length > 0) await bucket.remove(leftover);
    await prisma.storageDeletion.deleteMany({ where: { path: { startsWith: owner.id } } });
    await prisma.material.deleteMany({ where: { userId: { in: [owner.id, stranger.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, stranger.id] } } });
  }
});
