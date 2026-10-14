import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { mainRouter } from "../src/routes/main-router.ts";
import { ErrorMiddleware } from "../src/middlewares/errors.ts";
import { prisma } from "../lib/prisma.ts";
import { brasiliaDate } from "../src/utils/academic-date.ts";

test("dashboard: persistência, limites de acesso, dias pendentes e conclusão reversível", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  const app = express();
  app.use(express.json()); app.use(mainRouter); app.use(ErrorMiddleware);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}`;
  const userIds: string[] = [];
  async function call(path: string, token?: string, method = "GET", input?: unknown) {
    const response = await fetch(url + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: input === undefined ? undefined : JSON.stringify(input) });
    return { status: response.status, body: await response.json() };
  }
  try {
    for (let index = 0; index < 2; index++) {
      const user = await prisma.user.create({ data: { name: "Teste integração temporário", email: `today-${randomUUID()}@example.invalid`, passwordHash: "not-a-login-password" } });
      userIds.push(user.id);
    }
    const [ownerId, otherId] = userIds;
    const ownerToken = jwt.sign({ id: ownerId }, process.env.JWT_SECRET!, { expiresIn: "5m" });
    const otherToken = jwt.sign({ id: otherId }, process.env.JWT_SECRET!, { expiresIn: "5m" });
    const date = brasiliaDate(); const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    assert.equal((await call("/users/me/dashboard")).status, 401);
    assert.equal((await call(`/users/${ownerId}/dashboard`, otherToken)).status, 403);
    const created = await call("/disciplines", ownerToken, "POST", { name: "Integração", workloadHours: 60, userId: ownerId, days: [weekday, weekday], absences: 3 });
    assert.equal(created.status, 201);
    const discipline = created.body.data; assert.equal(discipline.schedules.length, 1);
    const schedule = discipline.schedules[0]; assert.equal(schedule.startTime, null); assert.equal(schedule.endTime, null);
    assert.equal((await call(`/disciplines/${discipline.id}`, otherToken)).status, 403);
    assert.equal((await call("/tasks", otherToken, "POST", { title: "Não autorizado", userId: otherId, disciplineId: discipline.id, dueDate: new Date().toISOString() })).status, 403);
    assert.equal((await call("/disciplines", otherToken, "POST", { name: "Não autorizado", workloadHours: 60, userId: ownerId })).status, 403);
    let dashboard = (await call("/users/me/dashboard", ownerToken)).body.data;
    assert.equal(dashboard.disciplines[0].absences, 4);
    assert.equal((await call(`/schedules/${schedule.id}/attendance`, otherToken, "PATCH", { attended: true })).status, 404);
    assert.equal((await call(`/schedules/${schedule.id}/attendance`, ownerToken, "PATCH", { attended: true })).status, 200);
    assert.equal((await call(`/schedules/${schedule.id}/attendance`, ownerToken, "PATCH", { attended: true })).status, 200);
    dashboard = (await call("/users/me/dashboard", ownerToken)).body.data;
    assert.equal(dashboard.disciplines[0].absences, 3);
    assert.equal(dashboard.disciplines[0].schedules[0].attended, true);
    assert.equal((await call(`/schedules/${schedule.id}/attendance`, ownerToken, "PATCH", { attended: false })).status, 200);
    assert.equal((await call("/users/me/dashboard", ownerToken)).body.data.disciplines[0].absences, 4);
    const task = (await call("/tasks", ownerToken, "POST", { title: "Tarefa", dueDate: `${date}T23:59:00-03:00`, userId: ownerId, disciplineId: discipline.id })).body.data;
    assert.equal((await call(`/tasks/${task.id}/complete`, otherToken, "PATCH")).status, 403);
    const completed = await call(`/tasks/${task.id}/complete`, ownerToken, "PATCH");
    assert.equal(completed.body.data.status, "COMPLETED"); assert.ok(completed.body.data.completedAt);
    const reopened = await call(`/tasks/${task.id}`, ownerToken, "PUT", { status: "PENDING" });
    assert.equal(reopened.body.data.status, "PENDING"); assert.equal(reopened.body.data.completedAt, null);
    const assessment = { title: "Nota", date: new Date().toISOString(), disciplineId: discipline.id, score: 8, weight: 2 };
    assert.equal((await call("/evaluations", otherToken, "POST", assessment)).status, 403);
    assert.equal((await call("/evaluations", ownerToken, "POST", { ...assessment, score: 11 })).status, 400);
    assert.equal((await call("/evaluations", ownerToken, "POST", assessment)).status, 201);
    dashboard = (await call("/users/me/dashboard", ownerToken)).body.data;
    assert.equal(dashboard.disciplines[0].evaluations[0].score, 8);
    assert.equal(dashboard.tasks.length, 1); assert.equal(dashboard.today, date);
    assert.equal((await call("/users/me/dashboard", otherToken)).body.data.disciplines.length, 0);
  } finally {
    // Limpeza exclusiva das contas criadas por este teste; relacionamentos são removidos por cascade.
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
