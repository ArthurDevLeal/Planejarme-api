import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.ts";
import { ErrorMiddleware } from "../src/middlewares/errors.ts";

let server: Server;
let baseUrl = "";

before(async () => {
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
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /materials/upload sem arquivo retorna 400 padronizado", async () => {
  const response = await fetch(`${baseUrl}/materials/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Teste" }),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.match(body.message, /arquivo/i);
});

test("POST /materials com storagePath cria material com sucesso", async () => {
  const testPayload = {
    title: "Documento de Teste Automatizado.pdf",
    type: "PDF",
    url: "",
    fileSizeMb: 1.5,
    mimeType: "application/pdf",
    storagePath: "test-user/doc-teste.pdf",
    userId: "27800be8-7b37-4287-8a0a-2e6587fa220f",
  };

  const response = await fetch(`${baseUrl}/materials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(testPayload),
  });

  assert.equal(response.status, 201);
  const resBody = await response.json();
  assert.equal(resBody.success, true);
  assert.equal(resBody.data.title, testPayload.title);
  assert.equal(resBody.data.storagePath, testPayload.storagePath);
  assert.equal(resBody.data.fileSizeMb, 1.5);

  const materialId = resBody.data.id;

  // GET /materials/:id
  const getRes = await fetch(`${baseUrl}/materials/${materialId}`);
  assert.equal(getRes.status, 200);
  const getBody = await getRes.json();
  assert.equal(getBody.data.id, materialId);

  // GET /materials/user/:userId
  const listRes = await fetch(`${baseUrl}/materials/user/27800be8-7b37-4287-8a0a-2e6587fa220f`);
  assert.equal(listRes.status, 200);
  const listBody = await listRes.json();
  assert.ok(listBody.data.some((m: { id: string }) => m.id === materialId));

  // DELETE /materials/:id
  const delRes = await fetch(`${baseUrl}/materials/${materialId}`, { method: "DELETE" });
  assert.equal(delRes.status, 200);

  // Verify deletion in DB
  const checkDel = await prisma.material.findUnique({ where: { id: materialId } });
  assert.equal(checkDel, null);
});

test("GET /materials/:id/download-url com url pública retorna link de download", async () => {
  const material = await prisma.material.create({
    data: {
      title: "Link Externo de Slides",
      type: "LINK",
      url: "https://example.com/slides-aula-1",
      userId: "27800be8-7b37-4287-8a0a-2e6587fa220f",
    },
  });

  try {
    const response = await fetch(`${baseUrl}/materials/${material.id}/download-url`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.data.downloadUrl, "https://example.com/slides-aula-1");
  } finally {
    await prisma.material.delete({ where: { id: material.id } }).catch(() => {});
  }
});

test("POST /materials com Bearer token associa material ao req.userId autenticado", async () => {
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

  // GET /materials/user/me com token retorna o material
  const meRes = await fetch(`${baseUrl}/materials/user/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(meRes.status, 200);
  const meBody = await meRes.json();
  assert.ok(meBody.data.some((m: { id: string }) => m.id === materialId));

  // PUT /materials/:id para classificar (vincular disciplina)
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

  // Cleanup
  await prisma.material.delete({ where: { id: materialId } }).catch(() => {});
});

test("POST /materials/upload com arquivo multipart real, acentos e espaços", async () => {
  const testUserId = "27800be8-7b37-4287-8a0a-2e6587fa220f";
  const token = jwt.sign({ id: testUserId }, process.env.JWT_SECRET || "awdpkajdajd0ahd08uajhdo8ahd0a8hdadnadha08ushd");

  const formData = new FormData();
  const fileContent = "PDF simulado para teste de upload e download";
  formData.append("file", new Blob([fileContent], { type: "application/pdf" }), "Relatório de Física #1.pdf");

  const uploadRes = await fetch(`${baseUrl}/materials/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

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

  // GET /materials/:id/download-url retorna signed URL do Supabase Storage
  const downloadRes = await fetch(`${baseUrl}/materials/${materialId}/download-url`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(downloadRes.status, 200);
  const downloadBody = await downloadRes.json();
  assert.equal(downloadBody.success, true);
  assert.ok(downloadBody.data.downloadUrl);
  assert.ok(downloadBody.data.downloadUrl.startsWith("http"));

  // GET /materials/user/me lista o material na caixa de entrada
  const listRes = await fetch(`${baseUrl}/materials/user/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(listRes.status, 200);
  const listBody = await listRes.json();
  const found = listBody.data.find((m: { id: string }) => m.id === materialId);
  assert.ok(found);
  assert.equal(found.disciplineId, null);

  // DELETE /materials/:id remove do banco e do storage
  const delRes = await fetch(`${baseUrl}/materials/${materialId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(delRes.status, 200);

  // Verificação no banco
  const checkDb = await prisma.material.findUnique({ where: { id: materialId } });
  assert.equal(checkDb, null);

  // GET /materials/:id após exclusão retorna 404
  const notFoundRes = await fetch(`${baseUrl}/materials/${materialId}`);
  assert.equal(notFoundRes.status, 404);
});

