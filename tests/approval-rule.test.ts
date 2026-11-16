import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { mainRouter } from "../src/routes/main-router.ts";
import { ErrorMiddleware } from "../src/middlewares/errors.ts";
import { prisma } from "../lib/prisma.ts";
import { UpdateDisciplineSchema } from "../src/schemas/discipline-schema.ts";
import { CreateEvaluationSchema } from "../src/schemas/evaluation-schema.ts";

test("regra de aprovação: validação dos campos", () => {
  assert.equal(UpdateDisciplineSchema.safeParse({ passingScore: 6, maxAbsencePct: 30 }).success, true);
  assert.equal(UpdateDisciplineSchema.safeParse({ passingScore: null, maxAbsencePct: null }).success, true);
  assert.equal(UpdateDisciplineSchema.safeParse({ passingScore: 11 }).success, false);
  assert.equal(UpdateDisciplineSchema.safeParse({ maxAbsencePct: 101 }).success, false);
  assert.equal(UpdateDisciplineSchema.safeParse({ passingScore: 6, finalMinAverage: 6 }).success, false);
  assert.equal(UpdateDisciplineSchema.safeParse({ finalExamWeight: 0 }).success, false);
  const evaluation = { title: "Final", date: "2026-12-01", disciplineId: "d" };
  assert.equal(CreateEvaluationSchema.safeParse({ ...evaluation, kind: "FINAL" }).success, true);
  assert.equal(CreateEvaluationSchema.safeParse({ ...evaluation, kind: "OUTRA" }).success, false);
});

test("regra de aprovação e situação pela API", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
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
    data: { name: "Regra temporário", email: `rule-${randomUUID()}@example.invalid`, passwordHash: "x" },
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
    const discipline = await prisma.discipline.create({ data: { name: "Cálculo", workloadHours: 60, userId: user.id } });
    await prisma.evaluation.createMany({
      data: [
        { title: "P1", weight: 1, score: 5.5, date: new Date("2026-10-01"), disciplineId: discipline.id },
        { title: "P2", weight: 1, date: new Date("2099-01-01"), disciplineId: discipline.id },
      ],
    });

    // Sem regra própria: herda média 7 do usuário → precisa de 8,5.
    let status = await call(`/disciplines/${discipline.id}/status`);
    assert.equal(status.status, 200);
    assert.equal(status.body.data.verdict, "RISK");
    assert.equal(status.body.data.neededOnNext.needed, 8.5);
    assert.equal(status.body.data.rule.inherited.passingScore, true);

    // Regra própria com média 6 → precisa de 6,5.
    const updated = await call(`/disciplines/${discipline.id}`, "PUT", { passingScore: 6, maxAbsencePct: 30 });
    assert.equal(updated.status, 200);
    status = await call(`/disciplines/${discipline.id}/status`);
    assert.equal(status.body.data.neededOnNext.needed, 6.5);
    assert.equal(status.body.data.absencesLimit, 18);
    assert.match(status.body.data.ruleText, /^Aprova com média simples 6 e até 30% de faltas \(18 aulas\)/);

    // Só uma prova final por disciplina.
    const final = { title: "Final", date: "2099-02-01", disciplineId: discipline.id, kind: "FINAL" };
    assert.equal((await call("/evaluations", "POST", final)).status, 201);
    assert.equal((await call("/evaluations", "POST", final)).status, 400);

    // A lista de disciplinas do dashboard traz a situação calculada.
    const list = await call("/users/me/disciplines?include=schedules,evaluations");
    const row = list.body.data.find((item: { id: string }) => item.id === discipline.id);
    assert.equal(row.status.neededOnNext.needed, 6.5);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
