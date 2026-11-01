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
import { TrashItemSchema } from "../src/schemas/trash-schema.ts";
import { PurgeExpiredTrashService } from "../src/services/trash-service.ts";

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

const tokenFor = (id: string) => jwt.sign({ id }, process.env.JWT_SECRET || "test-secret", { expiresIn: "5m" });

test("lixeira só aceita tarefa ou material", () => {
  assert.equal(TrashItemSchema.safeParse({ kind: "task", id: "x" }).success, true);
  assert.equal(TrashItemSchema.safeParse({ kind: "user", id: "x" }).success, false);
});

test("RN15: upload recusa extensão fora da lista", async () => {
  const form = new FormData();
  form.append("file", new Blob(["MZ"], { type: "application/octet-stream" }), "programa.exe");
  const response = await fetch(`${baseUrl}/materials/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenFor("qualquer")}` },
    body: form,
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /Tipo de arquivo não aceito/);
});

test("RN16 e RF13: lixeira, restauração, exclusão definitiva, limpeza e anexos", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  const [owner, stranger] = await Promise.all(
    ["Dono", "Outro"].map((name) =>
      prisma.user.create({ data: { name: `${name} lixeira`, email: `trash-${randomUUID()}@example.invalid`, passwordHash: "x" } }),
    ),
  );
  const token = tokenFor(owner.id);
  async function call(path: string, method = "GET", input?: unknown, as = token) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${as}` },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
  }

  try {
    const discipline = await prisma.discipline.create({ data: { name: "Física", workloadHours: 60, userId: owner.id } });
    const task = await prisma.task.create({
      data: { title: "Relatório", dueDate: new Date("2099-01-10"), userId: owner.id, disciplineId: discipline.id },
    });

    // Anexo: link na tarefa herda a disciplina dela; outro usuário não anexa nem lista.
    const attached = await call("/materials", "POST", { title: "Enunciado", type: "LINK", url: "https://example.com/e", taskId: task.id });
    assert.equal(attached.status, 201);
    assert.equal(attached.body.data.taskId, task.id);
    assert.equal(attached.body.data.disciplineId, discipline.id);
    assert.equal((await call(`/materials/task/${task.id}`)).body.data.length, 1);
    assert.equal((await call(`/materials/task/${task.id}`, "GET", undefined, tokenFor(stranger.id))).status, 403);
    assert.equal(
      (await call("/materials", "POST", { title: "x", type: "LINK", url: "https://x.com", taskId: task.id }, tokenFor(stranger.id))).status,
      403,
    );

    // Excluir manda para a lixeira: some das listas e do GET, aparece em /trash.
    assert.equal((await call(`/tasks/${task.id}`, "DELETE")).status, 200);
    assert.equal((await call(`/tasks/${task.id}`)).status, 404);
    assert.ok(!(await call(`/tasks/user/me`)).body.data.some((t: { id: string }) => t.id === task.id));
    const trash = await call("/trash");
    assert.equal(trash.body.data.retentionDays, 30);
    assert.deepEqual(trash.body.data.tasks.map((t: { id: string }) => t.id), [task.id]);

    // Outro usuário não restaura; o dono restaura.
    assert.equal((await call(`/trash/task/${task.id}/restore`, "PATCH", undefined, tokenFor(stranger.id))).status, 403);
    assert.equal((await call(`/trash/task/${task.id}/restore`, "PATCH")).status, 200);
    assert.equal((await call(`/tasks/${task.id}`)).status, 200);
    assert.equal((await call(`/trash/task/${task.id}/restore`, "PATCH")).status, 404);

    // Exclusão definitiva leva os anexos junto.
    await call(`/tasks/${task.id}`, "DELETE");
    assert.equal((await call(`/trash/task/${task.id}`, "DELETE")).status, 200);
    assert.equal(await prisma.task.findUnique({ where: { id: task.id } }), null);
    assert.equal(await prisma.material.findUnique({ where: { id: attached.body.data.id } }), null);

    // Limpeza do cron: só o que passou de 30 dias.
    const old = await prisma.material.create({
      data: { title: "Antigo", type: "LINK", url: "https://example.com/a", userId: owner.id, deletedAt: new Date("2099-01-01") },
    });
    const recent = await prisma.material.create({
      data: { title: "Recente", type: "LINK", url: "https://example.com/r", userId: owner.id, deletedAt: new Date("2099-01-25") },
    });
    await PurgeExpiredTrashService(new Date("2099-02-05"));
    assert.equal(await prisma.material.findUnique({ where: { id: old.id } }), null);
    assert.ok(await prisma.material.findUnique({ where: { id: recent.id } }));
  } finally {
    await prisma.material.deleteMany({ where: { userId: { in: [owner.id, stranger.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, stranger.id] } } });
  }
});
