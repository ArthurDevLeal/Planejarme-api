import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { mainRouter } from "../src/routes/main-router.ts";
import { ErrorMiddleware } from "../src/middlewares/errors.ts";
import { prisma } from "../lib/prisma.ts";
import { CreateEvaluationSchema } from "../src/schemas/evaluation-schema.ts";
import { UpdateUserSchema } from "../src/schemas/user-schema.ts";
import { storedTaskStatus, withTaskStatus } from "../src/utils/task-status.ts";

const now = new Date("2026-11-01T15:00:00Z");

test("RN11/RN13: tarefa não concluída com prazo vencido sai como OVERDUE", () => {
  const yesterday = new Date("2026-10-31T15:00:00Z");
  assert.equal(withTaskStatus({ status: "PENDING", dueDate: yesterday }, now).status, "OVERDUE");
  assert.equal(withTaskStatus({ status: "IN_PROGRESS", dueDate: yesterday }, now).status, "IN_PROGRESS");
  assert.equal(withTaskStatus({ status: "COMPLETED", dueDate: yesterday }, now).status, "COMPLETED");
  assert.equal(withTaskStatus({ status: "PENDING", dueDate: new Date("2026-11-01T03:00:00Z") }, now).status, "PENDING");
  assert.equal(withTaskStatus({ status: "PENDING", dueDate: new Date("2026-11-01T01:00:00Z") }, now).status, "OVERDUE");
  assert.equal(storedTaskStatus("OVERDUE"), "PENDING");
  assert.equal(storedTaskStatus("COMPLETED"), "COMPLETED");
});

test("RN05: peso e nota ficam entre 0 e 10", () => {
  const base = { title: "P1", date: "2026-11-10", disciplineId: "d1" };
  assert.equal(CreateEvaluationSchema.safeParse({ ...base, weight: 10, score: 10 }).success, true);
  assert.equal(CreateEvaluationSchema.safeParse({ ...base, weight: 10.5 }).success, false);
  assert.equal(CreateEvaluationSchema.safeParse({ ...base, weight: 0 }).success, false);
  assert.equal(CreateEvaluationSchema.safeParse({ ...base, score: 10.01 }).success, false);
  assert.equal(CreateEvaluationSchema.safeParse({ ...base, score: -1 }).success, false);
});

test("RN09: arredondamento aceita só NEAREST, UP ou DOWN", () => {
  assert.equal(UpdateUserSchema.safeParse({ roundingMode: "UP" }).success, true);
  assert.equal(UpdateUserSchema.safeParse({ roundingMode: "HALF_EVEN" }).success, false);
});

test("RN06, RN11 e RN09 pela API", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  const app = express();
  app.use(express.json());
  app.use(mainRouter);
  app.use(ErrorMiddleware);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}`;

  const user = await prisma.user.create({
    data: { name: "Regras temporário", email: `rules-${randomUUID()}@example.invalid`, passwordHash: "x", plan: "PRO" },
  });
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, { expiresIn: "5m" });
  async function call(path: string, method = "GET", input?: unknown) {
    const response = await fetch(url + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
  }

  try {
    const discipline = await prisma.discipline.create({
      data: { name: "Física", workloadHours: 60, gradingSystem: "WEIGHTED", userId: user.id },
    });
    await prisma.evaluation.createMany({
      data: [
        { title: "P1", weight: 4, date: new Date(), disciplineId: discipline.id },
        { title: "P2", weight: 3, date: new Date(), disciplineId: discipline.id },
      ],
    });
    let summary = await call(`/evaluations/discipline/${discipline.id}/summary`);
    assert.equal(summary.body.data.plannedWeight, 7);
    assert.equal(summary.body.data.weightStatus, "INCOMPLETE");
    assert.equal((await call("/evaluations", "POST", { title: "P3", weight: 4, date: "2026-12-01", disciplineId: discipline.id })).status, 201);
    summary = await call(`/evaluations/discipline/${discipline.id}/summary`);
    assert.equal(summary.body.data.weightStatus, "EXCEEDED");
    assert.equal((await call("/evaluations", "POST", { title: "P4", weight: 11, date: "2026-12-01", disciplineId: discipline.id })).status, 400);

    const created = await call("/tasks", "POST", { title: "Lista 1", dueDate: "2020-01-10T12:00:00Z", userId: user.id });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.status, "OVERDUE");
    const updated = await call(`/tasks/${created.body.data.id}`, "PUT", { status: "OVERDUE" });
    assert.equal(updated.body.data.status, "OVERDUE");
    assert.equal((await prisma.task.findUnique({ where: { id: created.body.data.id } }))?.status, "PENDING");
    const completed = await call(`/tasks/${created.body.data.id}/complete`, "PATCH");
    assert.equal(completed.body.data.status, "COMPLETED");
    assert.ok(completed.body.data.completedAt);

    assert.equal((await call("/users/me", "PUT", { roundingMode: "DOWN" })).status, 200);
    const dashboard = await call("/users/me/dashboard");
    assert.equal(dashboard.body.data.user.roundingMode, "DOWN");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
