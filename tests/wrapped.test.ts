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
import { brasiliaDate } from "../src/utils/academic-date.ts";

const DAY_MS = 86_400_000;
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

test("Fase 5: GET /semesters/:id/wrapped com dados reais, só para o dono", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  const owner = await prisma.user.create({ data: { name: "Wrapped", email: `wrapped-${randomUUID()}@example.invalid`, passwordHash: "x" } });
  const stranger = await prisma.user.create({ data: { name: "Outro", email: `wrapped-${randomUUID()}@example.invalid`, passwordHash: "x" } });
  try {
    const today = brasiliaDate();
    const day = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * DAY_MS);
    const semester = await prisma.semester.create({
      data: { name: "2026.2", startDate: day(-100), endDate: day(10), isCurrent: true, userId: owner.id },
    });
    const calc = await prisma.discipline.create({ data: { name: "Cálculo II", workloadHours: 60, userId: owner.id, semesterId: semester.id } });
    const fis = await prisma.discipline.create({ data: { name: "Física I", workloadHours: 60, userId: owner.id, semesterId: semester.id } });
    await prisma.evaluation.createMany({
      data: [
        { title: "P1", score: 9.5, date: day(-50), disciplineId: calc.id },
        { title: "P2", score: 8, date: day(-20), disciplineId: calc.id },
        { title: "P1", score: 4, date: day(-50), disciplineId: fis.id },
        { title: "P2", score: 10, date: day(-20), disciplineId: fis.id },
      ],
    });
    // Aulas em -14, -7 e hoje: presente na primeira, falta marcada na segunda, hoje sem registro (conta como falta).
    const schedule = await prisma.schedule.create({
      data: { disciplineId: calc.id, dayOfWeek: day(-14).getUTCDay(), attendanceSince: day(-14) },
    });
    await prisma.scheduleAttendance.createMany({
      data: [
        { scheduleId: schedule.id, date: day(-14), attended: true },
        { scheduleId: schedule.id, date: day(-7), attended: false },
      ],
    });
    await prisma.task.createMany({
      data: [
        { title: "Lista", dueDate: day(-3), status: "COMPLETED", completedAt: day(-3), userId: owner.id },
        { title: "Apagada", dueDate: day(-3), status: "COMPLETED", completedAt: day(-3), deletedAt: day(-1), userId: owner.id },
      ],
    });
    await prisma.quiz.create({ data: { userId: owner.id, disciplineId: calc.id, questions: [], score: 8, status: "DONE", model: "test" } });
    await prisma.classTemplate.create({ data: { token: randomUUID(), disciplineId: calc.id, ownerId: owner.id, importCount: 3 } });

    const auth = (id: string) => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET!, { expiresIn: "5m" })}` });
    const response = await fetch(`${baseUrl}/semesters/${semester.id}/wrapped`, { headers: auth(owner.id) });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, {
      semesterName: "2026.2",
      attendancePct: 33,
      disciplineCount: 2,
      passedCount: 2,
      bestGrade: { disciplineName: "Física I", evaluationTitle: "P2", score: 10 },
      biggestTurnaround: { disciplineName: "Física I", lowestScore: 4, passingScore: 7 },
      mostMissedWeekday: { dayOfWeek: day(-14).getUTCDay(), count: 2 },
      tasksCompleted: 1,
      quizzesDone: 1,
      quizAverage: 8,
      classmatesImported: 3,
      daysToEnd: 10,
      available: true,
    });

    assert.equal((await fetch(`${baseUrl}/semesters/${semester.id}/wrapped`, { headers: auth(stranger.id) })).status, 403);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, stranger.id] } } });
  }
});
