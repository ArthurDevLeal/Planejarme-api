import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import crypto, { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { hash } from "bcrypt";
import { mainRouter } from "../src/routes/main-router.ts";
import { ErrorMiddleware } from "../src/middlewares/errors.ts";
import { prisma } from "../lib/prisma.ts";
import { ResetPasswordSchema } from "../src/schemas/auth-schema.ts";

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

test("RF02: token de redefinição precisa ter tamanho mínimo e senha válida", () => {
  assert.equal(ResetPasswordSchema.safeParse({ token: "curto", password: "123456" }).success, false);
  assert.equal(ResetPasswordSchema.safeParse({ token: "x".repeat(43), password: "123" }).success, false);
  assert.equal(ResetPasswordSchema.safeParse({ token: "x".repeat(43), password: "123456" }).success, true);
});

test("recuperar senha, exportar dados e excluir conta", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  const app = express();
  app.use(express.json());
  app.use(mainRouter);
  app.use(ErrorMiddleware);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}`;
  async function call(path: string, method = "GET", input?: unknown, token?: string) {
    const response = await fetch(url + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
  }

  const email = `account-${randomUUID()}@example.invalid`;
  const user = await prisma.user.create({
    data: { name: "Conta Temporária", email, passwordHash: await hash("senha-antiga", 8) },
  });
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, { expiresIn: "5m" });

  try {
    // Pedido de link: mesma resposta para conta existente e inexistente; banco guarda só o hash.
    const known = await call("/auth/forgot-password", "POST", { email });
    const unknown = await call("/auth/forgot-password", "POST", { email: `ninguem-${randomUUID()}@example.invalid` });
    assert.equal(known.status, 200);
    assert.deepEqual(known.body, unknown.body);
    const stored = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    assert.equal(stored.length, 1);
    assert.match(stored[0].token, /^[0-9a-f]{64}$/);

    // Redefinição com token conhecido (o link real só existe no e-mail).
    const raw = crypto.randomBytes(32).toString("base64url");
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.passwordResetToken.create({
      data: { token: sha256(raw), userId: user.id, expiresAt: new Date(Date.now() + 60_000) },
    });
    assert.equal((await call("/auth/reset-password", "POST", { token: raw, password: "senha-nova-1" })).status, 200);
    const reused = await call("/auth/reset-password", "POST", { token: raw, password: "outra-senha" });
    assert.equal(reused.status, 400);
    assert.equal(reused.body.errorCode, "PASSWORD_RESET_TOKEN_EXPIRED");
    assert.equal((await call("/auth/signin", "POST", { email, password: "senha-nova-1" })).status, 200);

    const expiredRaw = crypto.randomBytes(32).toString("base64url");
    await prisma.passwordResetToken.create({
      data: { token: sha256(expiredRaw), userId: user.id, expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await call("/auth/reset-password", "POST", { token: expiredRaw, password: "senha-nova-2" });
    assert.equal(expired.body.errorCode, "PASSWORD_RESET_TOKEN_EXPIRED");

    // Exportação: dados completos, sem hash da senha.
    const discipline = await prisma.discipline.create({ data: { name: "Química", workloadHours: 40, userId: user.id } });
    await prisma.material.create({ data: { title: "Tabela", type: "LINK", url: "https://example.com/t", disciplineId: discipline.id } });
    const exported = await call("/users/me/export", "GET", undefined, token);
    assert.equal(exported.status, 200);
    assert.equal(exported.body.data.email, email);
    assert.equal(exported.body.data.passwordHash, undefined);
    assert.equal(exported.body.data.disciplines.length, 1);
    assert.equal(exported.body.data.materials.length, 1);

    // Exclusão: exige a senha e remove também materiais (que não saem no cascade).
    const wrong = await call("/users/me", "DELETE", { password: "errada" }, token);
    assert.equal(wrong.status, 400);
    assert.ok(await prisma.user.findUnique({ where: { id: user.id } }));
    assert.equal((await call("/users/me", "DELETE", {}, token)).status, 400);
    assert.equal((await call("/users/me", "DELETE", { password: "senha-nova-1" }, token)).status, 200);
    assert.equal(await prisma.user.findUnique({ where: { id: user.id } }), null);
    assert.equal(await prisma.material.count({ where: { title: "Tabela", disciplineId: null, userId: null } }), 0);
  } finally {
    await prisma.material.deleteMany({ where: { discipline: { userId: user.id } } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
