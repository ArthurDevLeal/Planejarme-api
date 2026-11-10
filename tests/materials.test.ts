import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.ts";
import { ErrorMiddleware } from "../src/middlewares/errors.ts";

let server: Server;
let baseUrl = "";
const dbTest = { skip: process.env.RUN_DB_TESTS !== "1" };
const TEST_USER_ID = "27800be8-7b37-4287-8a0a-2e6587fa220f";
const authHeader = () => ({
  Authorization: `Bearer ${jwt.sign({ id: TEST_USER_ID }, process.env.JWT_SECRET || "awdpkajdajd0ahd08uajhdo8ahd0a8hdadnadha08ushd")}`,
});

before(async () => {
  // Arquivos são do Pro: a conta dos testes precisa existir e ser Pro.
  if (!dbTest.skip) {
    await prisma.user.upsert({ where: { id: TEST_USER_ID }, update: { plan: "PRO" }, create: { id: TEST_USER_ID, name: "Materiais teste", email: `materials-${TEST_USER_ID}@example.invalid`, passwordHash: "x", plan: "PRO" } });
  }
  const { mainRouter } = await import("../src/routes/main-router.ts");
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
  if (!dbTest.skip) await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /materials/upload sem arquivo retorna 400 padronizado", dbTest, async () => {
  const response = await fetch(`${baseUrl}/materials/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ title: "Teste" }),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.match(body.message, /arquivo/i);
});

test("POST /materials ignora storagePath e userId vindos do corpo", dbTest, async () => {
  const testPayload = {
    title: "Documento de Teste Automatizado.pdf",
    type: "PDF",
    url: "",
    fileSizeMb: 1.5,
    mimeType: "application/pdf",
    storagePath: "outro-usuario/arquivo-alheio.pdf",
  };

  const response = await fetch(`${baseUrl}/materials`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(testPayload),
  });

  assert.equal(response.status, 201);
  const resBody = await response.json();
  assert.equal(resBody.success, true);
  assert.equal(resBody.data.title, testPayload.title);
  assert.equal(resBody.data.storagePath, null);
  assert.equal(resBody.data.userId, TEST_USER_ID);
  assert.equal(resBody.data.fileSizeMb, 1.5);

  const materialId = resBody.data.id;

  const getRes = await fetch(`${baseUrl}/materials/${materialId}`, { headers: authHeader() });
  assert.equal(getRes.status, 200);
  const getBody = await getRes.json();
  assert.equal(getBody.data.id, materialId);

  const listRes = await fetch(`${baseUrl}/materials/user/${TEST_USER_ID}`, { headers: authHeader() });
  assert.equal(listRes.status, 200);
  const listBody = await listRes.json();
  assert.ok(listBody.data.some((m: { id: string }) => m.id === materialId));

  const delRes = await fetch(`${baseUrl}/materials/${materialId}`, { method: "DELETE", headers: authHeader() });
  assert.equal(delRes.status, 200);

  const checkDel = await prisma.material.findUnique({ where: { id: materialId } });
  assert.ok(checkDel?.deletedAt);
  const forever = await fetch(`${baseUrl}/trash/material/${materialId}`, { method: "DELETE", headers: authHeader() });
  assert.equal(forever.status, 200);
  assert.equal(await prisma.material.findUnique({ where: { id: materialId } }), null);
});

test("GET /materials/:id/download-url com url pública retorna link de download", dbTest, async () => {
  const material = await prisma.material.create({
    data: {
      title: "Link Externo de Slides",
      type: "LINK",
      url: "https://example.com/slides-aula-1",
      userId: "27800be8-7b37-4287-8a0a-2e6587fa220f",
    },
  });

  try {
    const response = await fetch(`${baseUrl}/materials/${material.id}/download-url`, { headers: authHeader() });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.data.downloadUrl, "https://example.com/slides-aula-1");
  } finally {
    await prisma.material.delete({ where: { id: material.id } }).catch(() => {});
  }
});

test("POST /materials com Bearer token associa material ao req.userId autenticado", dbTest, async () => {
  const testUserId = "27800be8-7b37-4287-8a0a-2e6587fa220f";
  const token = jwt.sign({ id: testUserId }, process.env.JWT_SECRET || "awdpkajdajd0ahd08uajhdo8ahd0a8hdadnadha08ushd");

  const response = await fetch(`${baseUrl}/materials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: "Material Autenticado",
      type: "PDF",
      url: "",
    }),
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.userId, testUserId);
  assert.equal(body.data.disciplineId, null);

  const materialId = body.data.id;

  const meRes = await fetch(`${baseUrl}/materials/user/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(meRes.status, 200);
  const meBody = await meRes.json();
  assert.ok(meBody.data.some((m: { id: string }) => m.id === materialId));

  const updateRes = await fetch(`${baseUrl}/materials/${materialId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title: "Material Classificado" }),
  });
  assert.equal(updateRes.status, 200);
  const updateBody = await updateRes.json();
  assert.equal(updateBody.data.title, "Material Classificado");

  await prisma.material.delete({ where: { id: materialId } }).catch(() => {});
});

test("upload por URL assinada com arquivo real, acentos e espaços", dbTest, async () => {
  const testUserId = "27800be8-7b37-4287-8a0a-2e6587fa220f";
  const token = jwt.sign({ id: testUserId }, process.env.JWT_SECRET || "awdpkajdajd0ahd08uajhdo8ahd0a8hdadnadha08ushd");

  const fileContent = `PDF simulado para teste de upload e download ${Date.now()}`;
  const fileName = "Relatório de Física #1.pdf";
  const json = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const urlRes = await fetch(`${baseUrl}/materials/upload-url`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ fileName, sizeBytes: Buffer.byteLength(fileContent) }),
  });
  assert.equal(urlRes.status, 201);
  const { path, signedUrl } = (await urlRes.json()).data;
  assert.ok((await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: fileContent })).ok);

  const uploadRes = await fetch(`${baseUrl}/materials/upload`, { method: "POST", headers: json, body: JSON.stringify({ path, fileName }) });

  assert.equal(uploadRes.status, 201);
  const uploadBody = await uploadRes.json();
  assert.equal(uploadBody.success, true);
  assert.equal(uploadBody.data.title, "Relatório de Física #1.pdf");
  assert.equal(uploadBody.data.userId, testUserId);
  assert.equal(uploadBody.data.disciplineId, null);
  assert.ok(uploadBody.data.storagePath);
  assert.ok(!uploadBody.data.storagePath.includes("#"));
  assert.ok(!uploadBody.data.storagePath.includes("ó"));
  assert.ok(!uploadBody.data.storagePath.includes("í"));

  const materialId = uploadBody.data.id;

  const downloadRes = await fetch(`${baseUrl}/materials/${materialId}/download-url`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(downloadRes.status, 200);
  const downloadBody = await downloadRes.json();
  assert.equal(downloadBody.success, true);
  assert.ok(downloadBody.data.downloadUrl);
  assert.ok(downloadBody.data.downloadUrl.startsWith("http"));

  const listRes = await fetch(`${baseUrl}/materials/user/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(listRes.status, 200);
  const listBody = await listRes.json();
  const found = listBody.data.find((m: { id: string }) => m.id === materialId);
  assert.ok(found);
  assert.equal(found.disciplineId, null);

  const delRes = await fetch(`${baseUrl}/materials/${materialId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(delRes.status, 200);

  const checkDb = await prisma.material.findUnique({ where: { id: materialId } });
  assert.ok(checkDb?.deletedAt);

  const notFoundRes = await fetch(`${baseUrl}/materials/${materialId}`, { headers: authHeader() });
  assert.equal(notFoundRes.status, 404);

  const forever = await fetch(`${baseUrl}/trash/material/${materialId}`, { method: "DELETE", headers: authHeader() });
  assert.equal(forever.status, 200);
  assert.equal(await prisma.material.findUnique({ where: { id: materialId } }), null);
});

