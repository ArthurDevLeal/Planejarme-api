import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { mainRouter } from "../src/routes/main-router.ts";
import { ErrorMiddleware } from "../src/middlewares/errors.ts";
import { prisma } from "../lib/prisma.ts";
import { buildFolderPath, collectSubtree } from "../src/utils/folder-tree.ts";

let server: Server;
let baseUrl = "";
const suffix = randomUUID();
const ownerEmail = `dono-${suffix}@exemplo.test`;
const guestEmail = `convidado-${suffix}@exemplo.test`;
let ownerId = "";
let guestId = "";
let strangerId = "";
let disciplineId = "";

const tokenFor = (id: string) => jwt.sign({ id }, process.env.JWT_SECRET || "test-secret", { expiresIn: "5m" });

async function call(path: string, options: { method?: string; as?: string; body?: unknown } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(options.as ? { Authorization: `Bearer ${tokenFor(options.as)}` } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = (await response.json()) as { data: any; message: string };
  return { status: response.status, data: json.data, message: json.message };
}

const file = (title: string, extra: Record<string, unknown> = {}) =>
  prisma.material.create({ data: { title, type: "PDF", url: "https://exemplo.test/a.pdf", userId: ownerId, ...extra } });

before(async () => {
  process.env.JWT_SECRET ||= "test-secret";
  const app = express();
  app.use(express.json());
  app.use(mainRouter);
  app.use(ErrorMiddleware);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;

  // Quem compartilha precisa do Pro; a convidada fica no gratuito para provar que receber é livre.
  const user = (name: string, email: string, plan: "FREE" | "PRO" = "PRO") => prisma.user.create({ data: { name, email, passwordHash: "x", plan } });
  ownerId = (await user("Ana Souza", ownerEmail)).id;
  guestId = (await user("Bia", guestEmail, "FREE")).id;
  strangerId = (await user("Caio", `estranho-${suffix}@exemplo.test`)).id;
  disciplineId = (await prisma.discipline.create({ data: { name: "Redes", workloadHours: 60, userId: ownerId } })).id;
});

after(async () => {
  await prisma.material.deleteMany({ where: { userId: ownerId } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, guestId, strangerId] } } });
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("árvore de pastas: subárvore e caminho", () => {
  const folders = [{ id: "a", parentId: null }, { id: "b", parentId: "a" }, { id: "c", parentId: "b" }, { id: "d", parentId: null }];
  assert.deepEqual([...collectSubtree(folders, "b")].sort(), ["b", "c"]);
  assert.deepEqual(buildFolderPath(folders, "c").map((f) => f.id), ["a", "b", "c"]);
  assert.deepEqual(buildFolderPath(folders, "c", "b").map((f) => f.id), ["b", "c"]);
});

test("pastas: não entra em si mesma e herda a disciplina ao mover", async () => {
  const parent = (await call("/folders", { method: "POST", as: ownerId, body: { name: "Provas" } })).data;
  const child = (await call("/folders", { method: "POST", as: ownerId, body: { name: "P1", parentId: parent.id } })).data;
  const inside = await file("dentro.pdf", { folderId: child.id });

  const cycle = await call(`/folders/${parent.id}/move`, { method: "PATCH", as: ownerId, body: { parentId: child.id, disciplineId: null } });
  assert.equal(cycle.status, 400);

  const moved = await call(`/folders/${parent.id}/move`, { method: "PATCH", as: ownerId, body: { parentId: null, disciplineId } });
  assert.equal(moved.status, 200);
  const after = await prisma.material.findUniqueOrThrow({ where: { id: inside.id } });
  assert.equal(after.disciplineId, disciplineId);
  assert.equal((await prisma.folder.findUniqueOrThrow({ where: { id: child.id } })).disciplineId, disciplineId);
});

test("pastas: ninguém mexe na pasta ou põe arquivo na pasta de outra pessoa", async () => {
  const folder = (await call("/folders", { method: "POST", as: ownerId, body: { name: "Privada" } })).data;
  assert.equal((await call(`/folders/${folder.id}`, { method: "PUT", as: strangerId, body: { name: "x" } })).status, 403);
  assert.equal((await call("/folders", { method: "POST", as: strangerId, body: { name: "x", parentId: folder.id } })).status, 403);
  const own = await prisma.material.create({ data: { title: "m.pdf", type: "PDF", url: "", userId: strangerId } });
  assert.equal((await call(`/materials/${own.id}`, { method: "PUT", as: strangerId, body: { folderId: folder.id } })).status, 403);
  await prisma.material.delete({ where: { id: own.id } });
});

test("link: guest vê a pasta viva, navega, e o prazo não muda o endereço", async () => {
  const folder = (await call("/folders", { method: "POST", as: ownerId, body: { name: "Aulas" } })).data;
  const sub = (await call("/folders", { method: "POST", as: ownerId, body: { name: "Semana 1" } , })).data;
  await call(`/folders/${sub.id}/move`, { method: "PATCH", as: ownerId, body: { parentId: folder.id, disciplineId: null } });
  await file("raiz.pdf", { folderId: folder.id });
  const nested = await file("sub.pdf", { folderId: sub.id });
  const outside = await file("fora.pdf");
  await prisma.material.create({ data: { title: "atalho", type: "SHORTCUT", url: "https://x.test", userId: ownerId, folderId: folder.id } });

  const link = (await call("/shares/links", { method: "PUT", as: ownerId, body: { target: { kind: "folder", id: folder.id }, expiresIn: "1d" } })).data;
  const renewed = (await call("/shares/links", { method: "PUT", as: ownerId, body: { target: { kind: "folder", id: folder.id }, expiresIn: "30d" } })).data;
  assert.equal(renewed.token, link.token);
  assert.ok(Date.parse(renewed.expiresAt) > Date.parse(link.expiresAt));

  const root = await call(`/public/shares/${link.token}`);
  assert.equal(root.status, 200);
  assert.equal(root.data.ownerName, "Ana");
  assert.deepEqual(root.data.files.map((f: { title: string }) => f.title), ["raiz.pdf"]);
  assert.deepEqual(root.data.folders.map((f: { name: string }) => f.name), ["Semana 1"]);
  assert.equal("storagePath" in root.data.files[0], false);

  const inner = await call(`/public/shares/${link.token}?folderId=${sub.id}`);
  assert.deepEqual(inner.data.path.map((f: { name: string }) => f.name), ["Semana 1"]);
  assert.equal((await call(`/public/shares/${link.token}/files/${nested.id}`)).status, 200);

  await file("novo.pdf", { folderId: folder.id });
  assert.equal((await call(`/public/shares/${link.token}`)).data.files.length, 2);

  assert.equal((await call(`/public/shares/${link.token}/files/${outside.id}`)).status, 404);
  const other = (await call("/folders", { method: "POST", as: ownerId, body: { name: "Outra" } })).data;
  assert.equal((await call(`/public/shares/${link.token}?folderId=${other.id}`)).status, 404);

  await call(`/shares/links/${link.id}`, { method: "DELETE", as: ownerId });
  assert.equal((await call(`/public/shares/${link.token}`)).status, 404);
});

test("link: vencido dá 404 e renovar gera outro endereço", async () => {
  const material = await file("prova.pdf");
  const link = (await call("/shares/links", { method: "PUT", as: ownerId, body: { target: { kind: "material", id: material.id }, expiresIn: "1h" } })).data;
  assert.equal((await call(`/public/shares/${link.token}`)).data.files.length, 1);

  await prisma.shareLink.update({ where: { id: link.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await call(`/public/shares/${link.token}`)).status, 404);
  assert.equal((await call(`/public/shares/${link.token}/files/${material.id}`)).status, 404);

  const fresh = (await call("/shares/links", { method: "PUT", as: ownerId, body: { target: { kind: "material", id: material.id }, expiresIn: "1h" } })).data;
  assert.notEqual(fresh.token, link.token);
});

test("link: só o dono compartilha, e atalho não é compartilhável", async () => {
  const material = await file("meu.pdf");
  assert.equal((await call("/shares/links", { method: "PUT", as: strangerId, body: { target: { kind: "material", id: material.id }, expiresIn: "1h" } })).status, 404);
  assert.equal((await call("/shares/links", { method: "PUT", as: strangerId, body: { target: { kind: "discipline", id: disciplineId }, expiresIn: "1h" } })).status, 404);
  const shortcut = await prisma.material.create({ data: { title: "s", type: "SHORTCUT", url: "https://x.test", userId: ownerId } });
  assert.equal((await call("/shares/links", { method: "PUT", as: ownerId, body: { target: { kind: "material", id: shortcut.id }, expiresIn: "1h" } })).status, 400);
});

test("disciplina: compartilha só o que é dela", async () => {
  const inDiscipline = await file("redes.pdf", { disciplineId });
  const outside = await file("solto.pdf");
  const link = (await call("/shares/links", { method: "PUT", as: ownerId, body: { target: { kind: "discipline", id: disciplineId }, expiresIn: "1d" } })).data;
  const content = await call(`/public/shares/${link.token}`);
  assert.equal(content.data.kind, "discipline");
  assert.ok(content.data.files.some((f: { id: string }) => f.id === inDiscipline.id));
  assert.equal((await call(`/public/shares/${link.token}/files/${outside.id}`)).status, 404);
});

test("lixeira: encerra o acesso, restaurar não reabre e pasta volta inteira", async () => {
  const folder = (await call("/folders", { method: "POST", as: ownerId, body: { name: "Temporária" } })).data;
  const sub = (await call("/folders", { method: "POST", as: ownerId, body: { name: "Sub", parentId: folder.id } })).data;
  const inner = await file("a.pdf", { folderId: sub.id });
  const earlier = await file("antes.pdf", { folderId: sub.id, deletedAt: new Date(Date.now() - 60_000) });
  const link = (await call("/shares/links", { method: "PUT", as: ownerId, body: { target: { kind: "folder", id: folder.id }, expiresIn: "1d" } })).data;
  await call("/shares/invites", { method: "POST", as: ownerId, body: { target: { kind: "material", id: inner.id }, email: guestEmail } });

  assert.equal((await call(`/folders/${folder.id}`, { method: "DELETE", as: ownerId })).status, 200);
  assert.equal((await call(`/public/shares/${link.token}`)).status, 404);
  assert.equal((await call("/shares/received", { as: guestId })).data.some((s: { target: { id: string } }) => s.target.id === inner.id), false);

  const trash = (await call("/trash", { as: ownerId })).data;
  assert.ok(trash.folders.some((f: { id: string }) => f.id === folder.id));
  assert.equal(trash.folders.some((f: { id: string }) => f.id === sub.id), false);
  assert.equal(trash.materials.some((m: { id: string }) => m.id === inner.id), false);

  assert.equal((await call(`/trash/folder/${folder.id}/restore`, { method: "PATCH", as: ownerId })).status, 200);
  assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: inner.id } })).deletedAt, null);
  assert.ok((await prisma.material.findUniqueOrThrow({ where: { id: earlier.id } })).deletedAt);
  assert.equal((await prisma.folder.findUniqueOrThrow({ where: { id: sub.id } })).deletedAt, null);
  assert.equal(await prisma.shareLink.count({ where: { folderId: folder.id } }), 0);

  await call(`/folders/${folder.id}`, { method: "DELETE", as: ownerId });
  assert.equal((await call(`/trash/folder/${folder.id}`, { method: "DELETE", as: strangerId })).status, 403);
  assert.equal((await call(`/trash/folder/${folder.id}`, { method: "DELETE", as: ownerId })).status, 200);
  assert.equal(await prisma.folder.count({ where: { id: { in: [folder.id, sub.id] } } }), 0);
  assert.equal(await prisma.material.count({ where: { id: inner.id } }), 0);
});

test("convite: mesma resposta com ou sem conta e aparece para quem recebeu", async () => {
  const folder = (await call("/folders", { method: "POST", as: ownerId, body: { name: "Grupo" } })).data;
  const shared = await file("grupo.pdf", { folderId: folder.id });
  const target = { kind: "folder", id: folder.id };

  const known = await call("/shares/invites", { method: "POST", as: ownerId, body: { target, email: guestEmail.toUpperCase() } });
  const unknown = await call("/shares/invites", { method: "POST", as: ownerId, body: { target, email: `sem-conta-${suffix}@exemplo.test` } });
  assert.equal(known.status, 201);
  assert.equal(unknown.status, 201);
  assert.deepEqual(Object.keys(known.data).sort(), Object.keys(unknown.data).sort());

  assert.equal((await call("/shares/invites", { method: "POST", as: ownerId, body: { target, email: ownerEmail } })).status, 400);

  const received = (await call("/shares/received", { as: guestId })).data;
  const invite = received.find((s: { target: { id: string } }) => s.target.id === folder.id);
  assert.equal(invite.ownerName, "Ana Souza");

  const content = await call(`/shares/received/${invite.id}`, { as: guestId });
  assert.equal(content.data.files[0].id, shared.id);
  assert.equal((await call(`/shares/received/${invite.id}/files/${shared.id}`, { as: guestId })).status, 200);
  assert.equal((await call(`/shares/received/${invite.id}`, { as: strangerId })).status, 404);

  assert.equal(await prisma.notification.count({ where: { userId: guestId, type: "SHARE" } }) > 0, true);

  assert.equal((await call(`/shares/received/${invite.id}`, { method: "DELETE", as: guestId })).status, 200);
  assert.equal((await call("/shares/received", { as: guestId })).data.some((s: { id: string }) => s.id === invite.id), false);
  assert.ok(await prisma.material.findUnique({ where: { id: shared.id } }));
});

test("rotas de dono exigem login", async () => {
  assert.equal((await call("/shares")).status, 401);
  assert.equal((await call("/folders")).status, 401);
});
