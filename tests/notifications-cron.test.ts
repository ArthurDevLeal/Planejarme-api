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
import { GenerateDueNotificationsService } from "../src/services/notification-generator-service.ts";

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

test("cron exige o CRON_SECRET e fica fechado sem ele", async () => {
  const previous = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    assert.equal((await fetch(`${baseUrl}/cron/daily`, { headers: { Authorization: "Bearer " } })).status, 401);
    process.env.CRON_SECRET = "segredo-de-teste";
    assert.equal((await fetch(`${baseUrl}/cron/daily`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/cron/daily`, { headers: { Authorization: "Bearer errado" } })).status, 401);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test("RF17: avisa tarefas de hoje/amanhã e provas em até 2 dias, uma vez só", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  const now = new Date("2099-03-10T13:00:00Z");
  const at = (day: number) => new Date(`2099-03-${String(day).padStart(2, "0")}T15:00:00Z`);
  const user = await prisma.user.create({
    data: { name: "Avisos temporário", email: `notify-${randomUUID()}@example.invalid`, passwordHash: "x" },
  });
  try {
    const discipline = await prisma.discipline.create({ data: { name: "Cálculo", workloadHours: 60, userId: user.id } });
    await prisma.task.createMany({
      data: [
        { title: "Lista hoje", dueDate: at(10), userId: user.id, disciplineId: discipline.id },
        { title: "Relatório amanhã", dueDate: at(11), userId: user.id },
        { title: "Projeto longe", dueDate: at(15), userId: user.id },
        { title: "Já feita", dueDate: at(10), userId: user.id, status: "COMPLETED" },
      ],
    });
    await prisma.evaluation.createMany({
      data: [
        { title: "P1", date: at(12), disciplineId: discipline.id },
        { title: "P0 com nota", date: at(11), score: 8, disciplineId: discipline.id },
        { title: "P2 longe", date: at(14), disciplineId: discipline.id },
      ],
    });

    const first = await GenerateDueNotificationsService(now);
    const created = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { message: "asc" } });
    assert.equal(first.created, 3);
    assert.deepEqual(
      created.map((item) => [item.type, item.message]),
      [
        ["TASK_DUE", '"Lista hoje" (Cálculo) vence hoje.'],
        ["EXAM_SOON", '"P1" de Cálculo é em 2 dias.'],
        ["TASK_DUE", '"Relatório amanhã" vence amanhã.'],
      ],
    );

    assert.equal((await GenerateDueNotificationsService(now)).created, 0);
    await GenerateDueNotificationsService(new Date("2099-03-11T13:00:00Z"));
    assert.equal(await prisma.notification.count({ where: { userId: user.id } }), 3);

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, { expiresIn: "5m" });
    const response = await fetch(`${baseUrl}/notifications/user/me/read-all`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal((await response.json()).data.updated, 3);
    assert.equal(await prisma.notification.count({ where: { userId: user.id, read: false } }), 0);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
