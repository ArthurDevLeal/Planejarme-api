import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { ErrorCode, HttpException } from "../src/exceptions/root.ts";
import { ValidationException } from "../src/exceptions/validation.ts";
import { AuthMiddleware } from "../src/middlewares/auth.ts";
import { ErrorMiddleware } from "../src/middlewares/errors.ts";
import { CreateUserSchema } from "../src/schemas/user-schema.ts";
import { normalizeError } from "../src/utils/normalize-error.ts";
import { ErrorHandler } from "../src/utils/error-handler.ts";

let server: Server;
let baseUrl: string;
const originalSecret = process.env.JWT_SECRET;
const testSecret = "local-error-tests-only";

before(async () => {
  process.env.JWT_SECRET = testSecret;
  // Os testes das rotas só enviam dados inválidos, antes de qualquer consulta.
  process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
  const { mainRouter } = await import("../src/routes/main-router.ts");
  const app = express();
  app.use(express.json({ limit: "1kb" }));
  app.use(mainRouter);
  app.get("/protected", AuthMiddleware, (req, res) => res.json({ userId: req.userId }));
  app.get("/unexpected", ErrorHandler(() => { throw new Error("database password and SQL"); }));
  app.use((_req, _res, next) => next(new HttpException("A rota solicitada não existe.", ErrorCode.ROUTE_NOT_FOUND, 404)));
  app.use(ErrorMiddleware);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

function prismaError(code: string, modelName?: string) {
  return { name: "PrismaClientKnownRequestError", code, meta: { modelName }, message: "private database details" };
}

for (const model of ["User", "Discipline", "Evaluation", "Task", "Material", "Schedule", "InboxItem", "Notification", "Semester"]) {
  test(`P2025 para ${model} retorna um 404 específico`, () => {
    const error = normalizeError(prismaError("P2025", model));
    const resource = model.replace(/[a-z]([A-Z])/g, (match) => `${match[0]}_${match[1]}`).toUpperCase();
    assert.equal(error.statusCode, 404);
    assert.equal(error.errorCode, `${resource}_NOT_FOUND`);
    assert.match(error.message, /não encontrad/);
    assert.doesNotMatch(error.message, /private/);
  });
}

for (const [code, status, errorCode] of [
  ["P2002", 409, ErrorCode.DUPLICATE_RECORD],
  ["P2003", 409, ErrorCode.RELATED_RECORD_NOT_FOUND],
  ["P1001", 503, ErrorCode.SERVICE_UNAVAILABLE],
  ["P1002", 503, ErrorCode.SERVICE_UNAVAILABLE],
  ["P1008", 503, ErrorCode.SERVICE_UNAVAILABLE],
  ["P1017", 503, ErrorCode.SERVICE_UNAVAILABLE],
  ["P2024", 503, ErrorCode.SERVICE_UNAVAILABLE],
] as const) {
  test(`Prisma ${code} é convertido para ${errorCode}`, () => {
    const error = normalizeError(prismaError(code));
    assert.equal(error.statusCode, status);
    assert.equal(error.errorCode, errorCode);
  });
}

test("duplicidade de usuário preserva o código e o status existentes", () => {
  const error = normalizeError(prismaError("P2002", "User"));
  assert.equal(error.statusCode, 400);
  assert.equal(error.errorCode, ErrorCode.USER_ALREADY_EXISTS);
  assert.match(error.message, /e-mail ou telefone/);
});

test("exceção HTTP existente mantém identidade e detalhes", () => {
  const error = new HttpException("Mensagem", ErrorCode.FORBIDDEN, 403, [{ field: "id" }]);
  assert.equal(normalizeError(error), error);
});

test("validação expõe campo e restrição em português, sem ecoar dados", () => {
  const result = CreateUserSchema.safeParse({ name: "", email: "invalid", password: "short" });
  const error = new ValidationException("Dados inválidos.", result);
  const details = error.errors as { field: string; code: string; message: string }[];
  assert.equal(error.statusCode, 400);
  assert.deepEqual(details.map((issue) => issue.field), ["name", "email", "password"]);
  assert.match(details[2].message, /6/);
  assert.doesNotMatch(JSON.stringify(details), /short|Too small|Invalid input/);
  assert.deepEqual(Object.keys(details[0]), ["field", "code", "message"]);
});

for (const endpoint of ["/auth/signin", "/users", "/disciplines", "/evaluations", "/tasks", "/materials", "/schedules", "/inbox-items", "/notifications", "/semesters"]) {
  test(`POST ${endpoint}: rota real retorna detalhes de validação`, async () => {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt.sign({ id: "test-user" }, testSecret, { expiresIn: "1m" })}` }, body: "{}",
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.data, null);
    assert.equal(body.errorCode, ErrorCode.INVALID_DATA);
    assert.ok(body.errors.length > 0);
    assert.ok(body.errors.every((issue: { field: string; message: string }) => typeof issue.field === "string" && typeof issue.message === "string"));
    assert.doesNotMatch(JSON.stringify(body), /Invalid input|Too small|stack|passwordHash/);
  });
}

for (const [name, header, code] of [
  ["sem token", undefined, ErrorCode.UNAUTHORIZED],
  ["esquema incorreto", "Basic abc", ErrorCode.AUTH_TOKEN_INVALID],
  ["token malformado", "Bearer invalid", ErrorCode.AUTH_TOKEN_INVALID],
] as const) {
  test(`autenticação ${name} usa o mesmo envelope de erro`, async () => {
    const response = await fetch(`${baseUrl}/protected`, { headers: header ? { Authorization: header } : {} });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.errorCode, code);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
    assert.match(body.message, /conta|token/);
  });
}

test("token expirado retorna AUTH_TOKEN_EXPIRED", async () => {
  const token = jwt.sign({ id: "test-user" }, testSecret, { expiresIn: -1 });
  const response = await fetch(`${baseUrl}/protected`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).errorCode, ErrorCode.AUTH_TOKEN_EXPIRED);
});

test("token válido mantém acesso e userId", async () => {
  const token = jwt.sign({ id: "test-user" }, testSecret, { expiresIn: "1m" });
  const response = await fetch(`${baseUrl}/protected`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userId: "test-user" });
});

test("token assinado sem id é inválido", async () => {
  const token = jwt.sign({}, testSecret, { expiresIn: "1m" });
  const response = await fetch(`${baseUrl}/protected`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal((await response.json()).errorCode, ErrorCode.AUTH_TOKEN_INVALID);
});

test("JSON malformado retorna 400 padronizado", async () => {
  const response = await fetch(`${baseUrl}/users`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: '{"name":',
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).errorCode, ErrorCode.INVALID_JSON);
});

test("corpo acima do limite retorna 413 padronizado", async () => {
  const response = await fetch(`${baseUrl}/users`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "a".repeat(2000) }),
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).errorCode, ErrorCode.PAYLOAD_TOO_LARGE);
});

test("rota inexistente retorna JSON com ROUTE_NOT_FOUND", async () => {
  const response = await fetch(`${baseUrl}/missing-route`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).errorCode, ErrorCode.ROUTE_NOT_FOUND);
});

test("erro inesperado retorna 500 sem detalhes internos", async () => {
  const response = await fetch(`${baseUrl}/unexpected`);
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.errorCode, ErrorCode.INTERNAL_SERVER_ERROR);
  assert.doesNotMatch(JSON.stringify(body), /database password|SQL|stack/);
});
