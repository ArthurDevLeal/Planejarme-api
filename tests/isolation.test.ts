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

async function call(path: string, token?: string, method = "GET", input?: unknown) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  return { status: response.status, body: await response.json() };
}

for (const [method, path] of [
  ["GET", "/inbox-items/user/me"],
  ["POST", "/inbox-items"],
  ["DELETE", "/inbox-items/qualquer-id"],
  ["GET", "/notifications/user/me"],
  ["PATCH", "/notifications/qualquer-id/read"],
  ["GET", "/materials/user/me"],
  ["GET", "/materials/qualquer-id/download-url"],
  ["POST", "/materials"],
  ["DELETE", "/materials/qualquer-id"],
]) {
  test(`${method} ${path} sem token retorna 401`, async () => {
    const { status, body } = await call(path, undefined, method, method === "POST" ? {} : undefined);
    assert.equal(status, 401);
    assert.equal(body.errorCode, "UNAUTHORIZED");
  });
}

test("usuário não acessa inbox, notificações nem materiais de outro", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  const createdUserIds: string[] = [];
  const createdMaterialIds: string[] = [];
  try {
    const [owner, stranger] = await Promise.all(
      ["Dono", "Estranho"].map((name) =>
        prisma.user.create({
          data: { name: `${name} temporário`, email: `isolation-${randomUUID()}@example.invalid`, passwordHash: "x" },
        }),
      ),
    );
    createdUserIds.push(owner.id, stranger.id);
    const ownerToken = jwt.sign({ id: owner.id }, process.env.JWT_SECRET!, { expiresIn: "5m" });
    const strangerToken = jwt.sign({ id: stranger.id }, process.env.JWT_SECRET!, { expiresIn: "5m" });

    const discipline = await prisma.discipline.create({
      data: { name: "Cálculo", workloadHours: 60, userId: owner.id },
    });
    const inbox = await prisma.inboxItem.create({ data: { content: "link", type: "LINK", userId: owner.id } });
    const notification = await prisma.notification.create({
      data: { title: "Prova", message: "Amanhã", type: "EXAM", userId: owner.id },
    });
    const material = await prisma.material.create({
      data: { title: "Slides", type: "LINK", url: "https://example.com/slides", userId: owner.id },
    });
    const legacyMaterial = await prisma.material.create({
      data: { title: "Apostila", type: "LINK", url: "https://example.com/apostila", disciplineId: discipline.id },
    });

    createdMaterialIds.push(material.id, legacyMaterial.id);

    const forbidden: [string, string, unknown?][] = [
      ["GET", `/inbox-items/${inbox.id}`],
      ["PUT", `/inbox-items/${inbox.id}`, { content: "alterado" }],
      ["DELETE", `/inbox-items/${inbox.id}`],
      ["GET", `/inbox-items/user/${owner.id}`],
      ["POST", "/inbox-items", { content: "x", type: "TEXT", userId: owner.id }],
      ["GET", `/notifications/${notification.id}`],
      ["PATCH", `/notifications/${notification.id}/read`],
      ["DELETE", `/notifications/${notification.id}`],
      ["GET", `/notifications/user/${owner.id}`],
      ["GET", `/notifications/user/${owner.id}/unread`],
      ["GET", `/materials/${material.id}`],
      ["GET", `/materials/${material.id}/download-url`],
      ["PUT", `/materials/${material.id}`, { title: "alterado" }],
      ["DELETE", `/materials/${material.id}`],
      ["GET", `/materials/${legacyMaterial.id}`],
      ["GET", `/materials/user/${owner.id}`],
      ["GET", `/materials/discipline/${discipline.id}`],
      ["POST", "/materials", { title: "x", type: "LINK", disciplineId: discipline.id }],
      ["PUT", `/materials/${material.id}`, { disciplineId: discipline.id }],
    ];
    for (const [method, path, input] of forbidden) {
      const { status } = await call(path, strangerToken, method, input);
      assert.equal(status, 403, `${method} ${path} deveria ser 403 para outro usuário`);
    }

    assert.equal((await call(`/inbox-items/${inbox.id}`, ownerToken)).status, 200);
    assert.equal((await call("/notifications/user/me", ownerToken)).status, 200);
    assert.equal((await call(`/materials/${legacyMaterial.id}`, ownerToken)).status, 200);
    const created = await call("/inbox-items", ownerToken, "POST", { content: "nota rápida", type: "TEXT" });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.userId, owner.id);

    assert.equal((await prisma.inboxItem.findUnique({ where: { id: inbox.id } }))?.content, "link");
    assert.equal((await prisma.notification.findUnique({ where: { id: notification.id } }))?.read, false);
    assert.equal((await prisma.material.findUnique({ where: { id: material.id } }))?.title, "Slides");

    const login = await call("/auth/signin", undefined, "POST", {
      email: `ninguem-${randomUUID()}@example.invalid`,
      password: "qualquer-senha",
    });
    assert.equal(login.status, 400);
    assert.equal(login.body.errorCode, "INVALID_CREDENTIALS");
  } finally {
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

test("login limita tentativas por IP com 429", async () => {
  let last = 0;
  for (let i = 0; i < 11; i++) last = (await call("/auth/signin", undefined, "POST", {})).status;
  assert.equal(last, 429);
});
