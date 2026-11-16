import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { mainRouter } from "../src/routes/main-router.ts";
import { ErrorMiddleware } from "../src/middlewares/errors.ts";
import { prisma } from "../lib/prisma.ts";
import {
  buildQuizInput, gradeQuiz, monthWindow, parseModelJson, QuizModelClient, setQuizModelClient, validateQuizQuestions,
} from "../src/services/quiz-service.ts";

const question = (i: number, source = "m1") => ({
  prompt: `Pergunta ${i}?`,
  options: ["A", "B", "C", "D"],
  answerIndex: i % 4,
  explanation: "Porque sim.",
  sourceMaterialId: source,
});

test("simulado: validação do JSON do modelo descarta o inválido e corta no tamanho pedido", () => {
  const raw = [
    question(0),
    { ...question(1), options: ["A", "B", "C"] }, // 3 alternativas
    { ...question(2), answerIndex: 5 }, // fora de 0-3
    { ...question(3), sourceMaterialId: "outro" }, // material que não foi enviado
    { ...question(4), options: ["A", "a", "C", "D"] }, // alternativas repetidas
    { ...question(5), answerIndex: "2", explanation: undefined, prompt: "  Com espaço  " }, // reparável
    { prompt: "" },
    ...Array.from({ length: 20 }, (_, i) => question(10 + i, "m2")),
  ];
  const valid = validateQuizQuestions(raw, 10, ["m1", "m2"]);
  assert.equal(valid.length, 10);
  assert.deepEqual(valid.map((q) => q.id), Array.from({ length: 10 }, (_, i) => `q${i + 1}`));
  assert.equal(valid[0].prompt, "Pergunta 0?");
  assert.deepEqual([valid[1].prompt, valid[1].answerIndex, valid[1].explanation], ["Com espaço", 2, ""]);
  assert.ok(valid.every((q) => q.options.length === 4 && ["m1", "m2"].includes(q.sourceMaterialId)));
  assert.deepEqual(validateQuizQuestions(null, 10, ["m1"]), []);
  assert.deepEqual(validateQuizQuestions({ questions: [] }, 10, ["m1"]), []);
});

test("simulado: JSON do modelo lido com cercas, texto em volta ou array solto", () => {
  assert.deepEqual(parseModelJson('{"questions":[1]}'), [1]);
  assert.deepEqual(parseModelJson('Aqui está:\n```json\n{"questions":[{"a":1}]}\n```'), [{ a: 1 }]);
  assert.deepEqual(parseModelJson('Claro! {"questions":[2]} Boa prova.'), [2]);
  assert.deepEqual(parseModelJson("[3]"), [3]);
  assert.equal(parseModelJson("não sei"), null);
  assert.equal(parseModelJson('{"questions":[1'), null);
});

test("simulado: nota de 0 a 10 = acertos / total × 10, sem resposta conta como erro", () => {
  const questions = validateQuizQuestions([question(0), question(1), question(2), question(3)], 4, ["m1"]);
  const graded = gradeQuiz(questions, [
    { questionId: "q1", chosenIndex: 0 },
    { questionId: "q2", chosenIndex: 1 },
    { questionId: "q3", chosenIndex: 0 },
  ]);
  assert.equal(graded.correct, 2);
  assert.equal(graded.score, 5);
  assert.deepEqual(graded.answers[3], { questionId: "q4", chosenIndex: null });
  assert.equal(gradeQuiz(questions.slice(0, 3), [{ questionId: "q1", chosenIndex: 0 }, { questionId: "q2", chosenIndex: 1 }]).score, 6.67);
});

test("simulado: orçamento de texto dividido entre materiais, na ordem, com prefixo", () => {
  const input = buildQuizInput([
    { id: "a", title: "Curto", text: "x".repeat(10) },
    { id: "b", title: "Longo", text: "y".repeat(500) },
    { id: "c", title: "Longo 2", text: "z".repeat(500) },
  ], 300);
  assert.ok(input.startsWith("[material:a] Curto\n"));
  assert.ok(input.includes("[material:c] Longo 2\n"));
  // a usa 10 dos 100 dele; b e c dividem os 290 que sobram.
  assert.equal((input.match(/y/g) ?? []).length, 145);
  assert.equal((input.match(/z/g) ?? []).length, 145);
  const { start, renewsAt } = monthWindow(new Date("2026-12-31T23:00:00Z"));
  assert.equal(start.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(renewsAt.toISOString(), "2027-01-01T00:00:00.000Z");
});

test("simulado pela API: PRO, limite, gabarito escondido, correção e refazer", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  const app = express();
  app.use(express.json());
  app.use(mainRouter);
  app.use(ErrorMiddleware);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}`;

  const pro = await prisma.user.create({ data: { name: "Quiz PRO", email: `quiz-pro-${randomUUID()}@example.invalid`, passwordHash: "x", plan: "PRO" } });
  const free = await prisma.user.create({ data: { name: "Quiz FREE", email: `quiz-free-${randomUUID()}@example.invalid`, passwordHash: "x" } });
  const other = await prisma.user.create({ data: { name: "Quiz outro", email: `quiz-other-${randomUUID()}@example.invalid`, passwordHash: "x", plan: "PRO" } });
  const tokenOf = (id: string) => jwt.sign({ id }, process.env.JWT_SECRET!, { expiresIn: "5m" });
  async function call(token: string, path: string, method = "GET", input?: unknown) {
    const response = await fetch(url + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
  }
  const proToken = tokenOf(pro.id);

  let lastInput: Parameters<QuizModelClient>[0] | undefined;
  const fake: QuizModelClient = async (input) => {
    lastInput = input;
    return {
      questions: Array.from({ length: input.count }, (_, i) => question(i, input.materialIds[i % input.materialIds.length])),
      model: "fake-model",
      inputTokens: 1000,
      outputTokens: 500,
    };
  };

  try {
    const discipline = await prisma.discipline.create({ data: { name: "Cálculo", workloadHours: 60, gradingSystem: "WEIGHTED", userId: pro.id } });
    const extractedAt = new Date();
    const withText = await prisma.material.create({
      data: { title: "Limites.pdf", type: "FILE", url: "", userId: pro.id, disciplineId: discipline.id, textContent: "Limite é o valor de que f(x) se aproxima.", textExtractedAt: extractedAt },
    });
    const scanned = await prisma.material.create({
      data: { title: "Escaneado.pdf", type: "FILE", url: "", userId: pro.id, disciplineId: discipline.id, textContent: "", textExtractedAt: extractedAt },
    });
    const foreign = await prisma.material.create({
      data: { title: "Alheio.pdf", type: "FILE", url: "", userId: other.id, textContent: "texto", textExtractedAt: extractedAt },
    });

    setQuizModelClient(fake);
    const freeDiscipline = await prisma.discipline.create({ data: { name: "Física", workloadHours: 60, gradingSystem: "WEIGHTED", userId: free.id } });
    const forbidden = await call(tokenOf(free.id), "/quizzes", "POST", { disciplineId: freeDiscipline.id, count: 10 });
    assert.equal(forbidden.status, 403);
    assert.match(forbidden.body.message, /plano Pro/);

    assert.equal((await call(proToken, "/quizzes", "POST", { disciplineId: discipline.id, count: 12 })).status, 400);
    assert.equal((await call(proToken, "/quizzes", "POST", { disciplineId: discipline.id, count: 10, materialIds: [foreign.id] })).status, 404);
    const noText = await call(proToken, "/quizzes", "POST", { disciplineId: discipline.id, count: 10, materialIds: [scanned.id] });
    assert.equal(noText.status, 400);
    assert.match(noText.body.message, /Nenhum material com texto legível/);

    // Padrão: todos os materiais da disciplina; o escaneado fica de fora.
    const created = await call(proToken, "/quizzes", "POST", { disciplineId: discipline.id, count: 10 });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const quiz = created.body.data;
    assert.equal(quiz.status, "READY");
    assert.equal(quiz.questions.length, 10);
    assert.deepEqual(lastInput?.materialIds, [withText.id]);
    assert.ok(lastInput?.prompt.includes(`[material:${withText.id}] Limites.pdf`));
    assert.deepEqual(quiz.materials, [{ id: withText.id, title: "Limites.pdf" }]);
    for (const q of quiz.questions) {
      assert.equal("answerIndex" in q, false);
      assert.equal("explanation" in q, false);
    }
    const fetched = await call(proToken, `/quizzes/${quiz.id}`);
    assert.equal("answerIndex" in fetched.body.data.questions[0], false);
    assert.equal(fetched.body.data.answers, null);
    assert.equal((await call(tokenOf(other.id), `/quizzes/${quiz.id}`)).status, 404);
    const stored = await prisma.quiz.findUnique({ where: { id: quiz.id } });
    assert.deepEqual([stored?.model, stored?.inputTokens, stored?.outputTokens], ["fake-model", 1000, 500]);

    // Acerta as 5 primeiras (answerIndex = i % 4) e erra as outras.
    const answers = quiz.questions.map((q: { id: string }, i: number) => ({ questionId: q.id, chosenIndex: i < 5 ? i % 4 : (i + 1) % 4 }));
    const graded = await call(proToken, `/quizzes/${quiz.id}/answers`, "PATCH", { answers });
    assert.equal(graded.status, 200);
    assert.equal(graded.body.data.status, "DONE");
    assert.equal(graded.body.data.score, 5);
    assert.equal(graded.body.data.questions[1].answerIndex, 1);
    assert.equal(graded.body.data.questions[1].explanation, "Porque sim.");
    assert.equal(graded.body.data.answers.length, 10);
    assert.equal((await call(proToken, `/quizzes/${quiz.id}/answers`, "PATCH", { answers })).status, 400);
    assert.equal((await call(proToken, `/quizzes/${quiz.id}/answers`, "PATCH", { answers: [{ questionId: "q1", chosenIndex: 4 }] })).status, 400);

    let list = await call(proToken, `/quizzes?disciplineId=${discipline.id}`);
    assert.equal(list.body.data.usage.used, 1);
    assert.equal(list.body.data.usage.limit, 15);

    const retry = await call(proToken, `/quizzes/${quiz.id}/retry`, "POST");
    assert.equal(retry.status, 201);
    assert.equal(retry.body.data.status, "READY");
    assert.equal(retry.body.data.questions.length, 10);
    assert.equal("answerIndex" in retry.body.data.questions[0], false);
    list = await call(proToken, `/quizzes?disciplineId=${discipline.id}`);
    assert.equal(list.body.data.usage.used, 1, "refazer não conta no limite");
    assert.equal(list.body.data.quizzes.length, 2);
    assert.deepEqual(Object.keys(list.body.data.quizzes[0]).sort(), ["createdAt", "disciplineId", "evaluationId", "id", "questionCount", "score", "status"]);

    // Modelo devolve lixo: FAILED, 503, não conta.
    setQuizModelClient(async () => ({ questions: [{ prompt: "?" }], model: "fake-model", inputTokens: 10, outputTokens: 1 }));
    assert.equal((await call(proToken, "/quizzes", "POST", { disciplineId: discipline.id, count: 10 })).status, 503);
    setQuizModelClient(async () => { throw new Error("timeout"); });
    assert.equal((await call(proToken, "/quizzes", "POST", { disciplineId: discipline.id, count: 10 })).status, 503);
    assert.equal(await prisma.quiz.count({ where: { userId: pro.id, status: "FAILED" } }), 2);
    list = await call(proToken, "/quizzes");
    assert.equal(list.body.data.usage.used, 1, "FAILED não conta no limite");

    // Limite do mês.
    setQuizModelClient(fake);
    await prisma.quiz.createMany({
      data: Array.from({ length: 14 }, () => ({ userId: pro.id, disciplineId: discipline.id, materialIds: [], questions: [], model: "fake-model" })),
    });
    const limited = await call(proToken, "/quizzes", "POST", { disciplineId: discipline.id, count: 10 });
    assert.equal(limited.status, 429);
    assert.match(limited.body.message, /renova em \d{2}\/\d{2}\/\d{4}/);

    // Cliente real do OpenRouter com fetch falso: formato do pedido e leitura da resposta (nenhuma chamada real).
    await prisma.quiz.deleteMany({ where: { userId: pro.id, status: { not: "DONE" } } });
    const savedKey = process.env.OPENROUTER_API_KEY;
    const savedModel = process.env.OPENROUTER_MODEL;
    const realFetch = globalThis.fetch;
    let sent: { headers: Record<string, string>; body: Record<string, any> } | undefined;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (!String(input).startsWith("https://openrouter.ai/")) return realFetch(input, init);
      sent = { headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) };
      const content = "```json\n" + JSON.stringify({ questions: Array.from({ length: 10 }, (_, i) => question(i, withText.id)) }) + "\n```";
      return new Response(JSON.stringify({
        model: "google/gemini-2.5-flash",
        choices: [{ finish_reason: "stop", message: { content } }],
        usage: { prompt_tokens: 321, completion_tokens: 123 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    process.env.OPENROUTER_API_KEY = "test-key-not-real";
    process.env.OPENROUTER_MODEL = "google/gemini-2.5-flash";
    setQuizModelClient(null);
    try {
      const viaRouter = await call(proToken, "/quizzes", "POST", { disciplineId: discipline.id, count: 10 });
      assert.equal(viaRouter.status, 201, JSON.stringify(viaRouter.body));
      assert.equal(sent?.headers.Authorization, "Bearer test-key-not-real");
      assert.equal(sent?.body.model, "google/gemini-2.5-flash");
      assert.equal(sent?.body.response_format.type, "json_schema");
      assert.deepEqual(sent?.body.response_format.json_schema.schema.properties.questions.items.properties.sourceMaterialId.enum, [withText.id]);
      const row = await prisma.quiz.findUnique({ where: { id: viaRouter.body.data.id } });
      assert.deepEqual([row?.model, row?.inputTokens, row?.outputTokens], ["google/gemini-2.5-flash", 321, 123]);
    } finally {
      globalThis.fetch = realFetch;
      if (savedModel === undefined) delete process.env.OPENROUTER_MODEL; else process.env.OPENROUTER_MODEL = savedModel;
    }

    // Sem chave e sem cliente injetado: 503 claro.
    delete process.env.OPENROUTER_API_KEY;
    try {
      const noKey = await call(proToken, "/quizzes", "POST", { disciplineId: discipline.id, count: 10 });
      assert.equal(noKey.status, 503);
      assert.equal(noKey.body.message, "Simulado indisponível: chave da IA não configurada.");
    } finally {
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = savedKey;
    }
  } finally {
    setQuizModelClient(null);
    await prisma.material.deleteMany({ where: { userId: { in: [pro.id, other.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [pro.id, free.id, other.id] } } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
