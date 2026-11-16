import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { mainRouter } from "../src/routes/main-router.ts";
import { ErrorMiddleware } from "../src/middlewares/errors.ts";
import { prisma } from "../lib/prisma.ts";

test("link da turma: prévia, importação, limite FREE e revogação", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  const app = express();
  app.use(express.json());
  app.use(mainRouter);
  app.use(ErrorMiddleware);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}`;

  const referralCode = Array.from(randomBytes(8), (byte) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[byte % 32]).join("");
  const ownerEmail = `class-owner-${randomUUID()}@example.invalid`;
  const owner = await prisma.user.create({
    data: { name: "Maria Souza Teste", email: ownerEmail, passwordHash: "x", plan: "FREE", referralCode, affiliateStatus: "ACTIVE", passingScore: 6 },
  });
  const student = await prisma.user.create({ data: { name: "Aluno Teste", email: `class-student-${randomUUID()}@example.invalid`, passwordHash: "x", plan: "FREE" } });
  const full = await prisma.user.create({ data: { name: "Cheio Teste", email: `class-full-${randomUUID()}@example.invalid`, passwordHash: "x", plan: "FREE" } });
  const userIds = [owner.id, student.id, full.id];
  const tokenOf = (id: string) => jwt.sign({ id }, process.env.JWT_SECRET!, { expiresIn: "5m" });

  async function call(path: string, method = "GET", userId?: string) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (userId) headers.Authorization = `Bearer ${tokenOf(userId)}`;
    const response = await fetch(url + path, { method, headers });
    return { status: response.status, body: await response.json() };
  }

  try {
    const discipline = await prisma.discipline.create({
      data: {
        name: "Cálculo I", professor: "Prof. Ana", classroom: "B12", workloadHours: 60, absences: 4, color: 3, icon: "calculator",
        gradingSystem: "WEIGHTED", maxAbsencePct: 20, hasFinalExam: true, finalExamWeight: 0.4, finalPassingScore: 5,
        userId: owner.id,
        schedules: { create: [{ dayOfWeek: 1, startTime: "08:00", endTime: "10:00" }, { dayOfWeek: 3, startTime: "10:00", endTime: "12:00" }] },
        evaluations: { create: [
          { title: "P1", weight: 4, score: 9.75, date: new Date("2026-09-20T12:00:00Z") },
          { title: "Final", weight: 1, date: new Date("2026-12-15T12:00:00Z"), kind: "FINAL" },
        ] },
      },
      include: { schedules: true },
    });
    await prisma.scheduleAttendance.create({ data: { scheduleId: discipline.schedules[0].id, date: new Date("2026-09-07"), attended: false } });
    await prisma.material.create({ data: { title: "Lista 1", type: "LINK", url: "https://example.invalid", userId: owner.id, disciplineId: discipline.id } });

    // FREE cria o link (não passa pelo ProOnlyWrites) e chamar de novo devolve o mesmo token.
    const created = await call(`/disciplines/${discipline.id}/class-template`, "POST", owner.id);
    assert.equal(created.status, 200);
    const token: string = created.body.data.token;
    assert.ok(token.length >= 16);
    assert.equal((await call(`/disciplines/${discipline.id}/class-template`, "POST", owner.id)).body.data.token, token);
    assert.equal((await call(`/disciplines/${discipline.id}/class-template`, "GET", owner.id)).body.data.token, token);
    assert.equal((await call(`/disciplines/${discipline.id}/class-template`, "POST", student.id)).status, 403);

    const preview = await call(`/public/class/${token}`);
    assert.equal(preview.status, 200);
    const data = preview.body.data;
    const raw = JSON.stringify(data);
    assert.equal(data.ownerFirstName, "Maria");
    assert.equal(data.ownerReferralCode, referralCode);
    assert.ok(!raw.includes(ownerEmail) && !raw.includes("Souza"));
    assert.ok(!raw.includes("score") && !raw.includes("9.75"));
    assert.deepEqual(data.evaluations.map((item: { date: string; kind: string }) => [item.date, item.kind]), [["2026-09-20", "REGULAR"], ["2026-12-15", "FINAL"]]);
    assert.equal(data.schedules.length, 2);
    assert.equal(data.passingScore, 6, "regra resolvida com o padrão do dono");
    assert.match(data.ruleText, /ponderada 6/);

    assert.equal((await call(`/class/${token}/import`, "POST", owner.id)).status, 400);
    assert.equal((await call(`/class/${token}/import`, "POST")).status, 401);

    const imported = await call(`/class/${token}/import`, "POST", student.id);
    assert.equal(imported.status, 201);
    assert.equal(imported.body.data.alreadyImported, false);
    const copy = await prisma.discipline.findUniqueOrThrow({
      where: { id: imported.body.data.disciplineId },
      include: { schedules: { include: { attendances: true } }, evaluations: true, materials: true, folders: true, tasks: true, semester: true },
    });
    assert.equal(copy.userId, student.id);
    assert.ok(copy.semester?.isCurrent);
    assert.equal(copy.absences, 0);
    assert.deepEqual([copy.name, copy.professor, copy.classroom, copy.workloadHours, copy.color, copy.icon], ["Cálculo I", "Prof. Ana", "B12", 60, 3, "calculator"]);
    assert.deepEqual(
      [copy.gradingSystem, copy.passingScore, copy.maxAbsencePct, copy.hasFinalExam, copy.finalExamWeight, copy.finalPassingScore],
      ["WEIGHTED", 6, 20, true, 0.4, 5],
    );
    assert.equal(copy.schedules.length, 2);
    assert.ok(copy.schedules.every((schedule) => schedule.attendances.length === 0));
    assert.deepEqual(copy.evaluations.map((item) => [item.title, item.kind, item.score]).sort(), [["Final", "FINAL", null], ["P1", "REGULAR", null]]);
    assert.equal(copy.materials.length + copy.folders.length + copy.tasks.length, 0);
    const template = await prisma.classTemplate.findUniqueOrThrow({ where: { token } });
    assert.equal(copy.importedFromTemplateId, template.id);
    assert.equal(template.importCount, 1);

    const again = await call(`/class/${token}/import`, "POST", student.id);
    assert.equal(again.status, 200);
    assert.deepEqual(again.body.data, { disciplineId: copy.id, alreadyImported: true });
    assert.equal((await prisma.classTemplate.findUniqueOrThrow({ where: { token } })).importCount, 1);
    assert.equal((await call(`/public/class/${token}`)).body.data.importCount, 1);

    const semester = await prisma.semester.create({
      data: { name: "2026.2", isCurrent: true, userId: full.id, startDate: new Date("2026-08-01"), endDate: new Date("2026-12-31") },
    });
    await prisma.discipline.createMany({
      data: Array.from({ length: 5 }, (_, index) => ({ name: `D${index}`, workloadHours: 30, userId: full.id, semesterId: semester.id })),
    });
    const blocked = await call(`/class/${token}/import`, "POST", full.id);
    assert.equal(blocked.status, 403);
    assert.match(blocked.body.message, /5 disciplinas por semestre/);

    assert.equal((await call(`/disciplines/${discipline.id}/class-template`, "DELETE", owner.id)).status, 200);
    assert.equal((await call(`/public/class/${token}`)).status, 404);
    assert.equal((await call(`/class/${token}/import`, "POST", full.id)).status, 404);
    assert.equal((await call(`/disciplines/${discipline.id}/class-template`, "GET", owner.id)).body.data, null);
  } finally {
    await prisma.material.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
