import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { hash } from "bcrypt";
import { mainRouter } from "../src/routes/main-router.ts";
import { ErrorMiddleware } from "../src/middlewares/errors.ts";
import { prisma } from "../lib/prisma.ts";

test("semestres e senha: criação com datas, cópia de disciplinas e troca de senha", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  const app = express();
  app.use(express.json());
  app.use(mainRouter);
  app.use(ErrorMiddleware);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}`;

  const createdUserIds: string[] = [];
  async function call(path: string, token: string, method = "GET", input?: unknown) {
    const response = await fetch(url + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
  }

  try {
    const owner = await prisma.user.create({
      data: {
        name: "Configurações temporário",
        email: `settings-${randomUUID()}@example.invalid`,
        passwordHash: await hash("senha-atual-123", 8),
      },
    });
    const stranger = await prisma.user.create({
      data: {
        name: "Outro usuário temporário",
        email: `settings-${randomUUID()}@example.invalid`,
        passwordHash: "not-a-login-password",
      },
    });
    createdUserIds.push(owner.id, stranger.id);
    const token = jwt.sign({ id: owner.id }, process.env.JWT_SECRET!, { expiresIn: "5m" });
    const strangerToken = jwt.sign({ id: stranger.id }, process.env.JWT_SECRET!, { expiresIn: "5m" });

    assert.equal((await call("/semesters", token, "POST", { name: "2026.2", userId: owner.id })).status, 400);
    const invalidRange = await call("/semesters", token, "POST", {
      name: "2026.2", userId: owner.id, startDate: "2026-12-20", endDate: "2026-08-01",
    });
    assert.equal(invalidRange.status, 400);

    const source = await call("/semesters", token, "POST", {
      name: "2026.2", userId: owner.id, isCurrent: true,
      startDate: "2026-08-01T00:00:00.000Z", endDate: "2026-12-20T00:00:00.000Z",
    });
    assert.equal(source.status, 201);
    const sourceId = source.body.data.id;

    const target = await call("/semesters", token, "POST", {
      name: "2027.1", userId: owner.id,
      startDate: "2027-02-01T00:00:00.000Z", endDate: "2027-06-30T00:00:00.000Z",
    });
    assert.equal(target.status, 201);
    const targetId = target.body.data.id;

    const switched = await call(`/semesters/${targetId}/current`, token, "PATCH");
    assert.equal(switched.status, 200);
    assert.equal(switched.body.data.isCurrent, true);
    const semesters = (await call(`/semesters/user/${owner.id}`, token)).body.data;
    assert.equal(semesters.filter((semester: { isCurrent: boolean }) => semester.isCurrent).length, 1);

    const discipline = await call("/disciplines", token, "POST", {
      name: "Cálculo I", professor: "Ana", classroom: "Sala 3", workloadHours: 60,
      userId: owner.id, semesterId: sourceId, days: [2],
    });
    assert.equal(discipline.status, 201);
    const disciplineId = discipline.body.data.id;
    const second = await call("/disciplines", token, "POST", {
      name: "Física I", workloadHours: 40, userId: owner.id, semesterId: sourceId,
    });
    assert.equal(second.status, 201);

    const copiedShallow = await call(`/semesters/${sourceId}/copy`, token, "POST", {
      targetSemesterId: targetId, disciplineIds: [disciplineId], copySchedules: false,
    });
    assert.equal(copiedShallow.status, 201);
    assert.equal(copiedShallow.body.data.copied, 1);
    const shallow = copiedShallow.body.data.disciplines[0];
    assert.equal(shallow.name, "Cálculo I");
    assert.equal(shallow.professor, "Ana");
    assert.equal(shallow.classroom, "Sala 3");
    assert.equal(shallow.workloadHours, 60);
    assert.equal(shallow.absences, 0);
    assert.equal(shallow.schedules.length, 0);
    assert.equal(shallow.semesterId, targetId);

    const copiedFull = await call(`/semesters/${sourceId}/copy`, token, "POST", {
      targetSemesterId: targetId, disciplineIds: [second.body.data.id], copySchedules: true,
    });
    assert.equal(copiedFull.status, 201);
    const secondCopy = copiedFull.body.data.disciplines[0];
    assert.equal(secondCopy.name, "Física I");
    assert.equal(secondCopy.schedules.length, 0);

    const withSchedules = await call(`/semesters/${sourceId}/copy`, token, "POST", {
      targetSemesterId: targetId, disciplineIds: [disciplineId], copySchedules: true,
    });
    assert.equal(withSchedules.status, 201);
    assert.equal(withSchedules.body.data.disciplines[0].schedules.length, 1);

    const copiedAll = await call(`/semesters/${sourceId}/copy`, token, "POST", {
      targetSemesterId: targetId, copySchedules: false,
    });
    assert.equal(copiedAll.status, 201);
    assert.equal(copiedAll.body.data.copied, 2);

    assert.equal(
      (await call(`/semesters/${targetId}/copy`, token, "POST", { targetSemesterId: targetId })).status,
      400,
    );
    assert.equal(
      (await call(`/semesters/${sourceId}/copy`, token, "POST", { targetSemesterId: targetId, disciplineIds: [] })).status,
      400,
    );

    assert.equal(
      (await call(`/semesters/${sourceId}/copy`, strangerToken, "POST", { targetSemesterId: targetId })).status,
      403,
    );
    assert.equal((await call(`/semesters/${targetId}/current`, strangerToken, "PATCH")).status, 403);

    assert.equal(
      (await call("/users/me/password", token, "PATCH", { currentPassword: "senha-errada", newPassword: "nova-senha-123" })).status,
      400,
    );
    assert.equal(
      (await call("/users/me/password", token, "PATCH", { currentPassword: "senha-atual-123", newPassword: "senha-atual-123" })).status,
      400,
    );
    assert.equal(
      (await call("/users/me/password", token, "PATCH", { currentPassword: "senha-atual-123", newPassword: "curta" })).status,
      400,
    );
    const changed = await call("/users/me/password", token, "PATCH", {
      currentPassword: "senha-atual-123", newPassword: "nova-senha-123",
    });
    assert.equal(changed.status, 200);

    const stored = await prisma.user.findUnique({ where: { id: owner.id }, select: { passwordHash: true } });
    assert.notEqual(stored?.passwordHash, "senha-atual-123");
    assert.equal(JSON.stringify(changed.body).includes("passwordHash"), false);
  } finally {
    for (const id of createdUserIds) {
      await prisma.user.delete({ where: { id } }).catch(() => undefined);
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
