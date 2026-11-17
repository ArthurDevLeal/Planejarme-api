import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { mainRouter } from "../src/routes/main-router.ts";
import { ErrorMiddleware } from "../src/middlewares/errors.ts";
import { prisma } from "../lib/prisma.ts";
import { schedule, setFlashcardModelClient, validateFlashcards } from "../src/services/flashcard-service.ts";

const now = new Date("2026-11-18T12:00:00Z");
const base = { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0 };
const days = (card: ReturnType<typeof schedule>) => (card.dueAt.getTime() - now.getTime()) / 86_400_000;

test("flashcards: again mantém reps, conta lapso, vence em 10 min e baixa a facilidade", () => {
  const next = schedule({ ...base, reps: 3, intervalDays: 10 }, "again", now);
  assert.deepEqual([next.reps, next.lapses, next.intervalDays, next.ease], [0, 1, 0, 2.3]);
  assert.equal(next.dueAt.getTime() - now.getTime(), 10 * 60_000);
});

test("flashcards: hard, good e easy seguem o SM-2 simplificado", () => {
  const hard = schedule({ ...base, reps: 2, intervalDays: 10 }, "hard", now);
  assert.deepEqual([hard.intervalDays, hard.ease, hard.reps], [12, 2.35, 3]);
  assert.equal(schedule(base, "hard", now).intervalDays, 1, "hard nunca passa de 1 dia para baixo");
  assert.equal(schedule({ ...base, reps: 1, intervalDays: 1 }, "hard", now).intervalDays, 2, "hard sempre avança pelo menos 1 dia");

  assert.equal(schedule(base, "good", now).intervalDays, 1);
  assert.equal(schedule({ ...base, reps: 1, intervalDays: 1 }, "good", now).intervalDays, 3);
  const good = schedule({ ...base, reps: 2, intervalDays: 10 }, "good", now);
  assert.deepEqual([good.intervalDays, good.ease, good.reps], [25, 2.5, 3]);
  assert.equal(days(good), 25);

  const easy = schedule({ ...base, reps: 2, intervalDays: 10 }, "easy", now);
  assert.deepEqual([easy.intervalDays, easy.ease], [33, 2.65]);
  assert.equal(schedule(base, "easy", now).intervalDays, 1);
});

test("flashcards: facilidade fica entre 1.3 e 2.8", () => {
  assert.equal(schedule({ ...base, ease: 1.3 }, "again", now).ease, 1.3);
  assert.equal(schedule({ ...base, ease: 1.35, reps: 2, intervalDays: 4 }, "hard", now).ease, 1.3);
  assert.equal(schedule({ ...base, ease: 2.75, reps: 2, intervalDays: 4 }, "easy", now).ease, 2.8);
});

test("flashcards: validação descarta cartão inválido e frente repetida, e corta no tamanho pedido", () => {
  const raw = [
    { front: "O que é limite?", back: "Valor de aproximação." },
    { front: "  o que é LIMITE  ", back: "Repetida (acento/caixa)." },
    { front: "ab", back: "Frente curta demais." },
    { front: "Sem verso", back: "" },
    { front: "x".repeat(301), back: "Frente longa demais." },
    { front: "Verso longo", back: "y".repeat(601) },
    { front: "Qué é derivada?", back: "Taxa de variação." },
    { front: 5, back: "tipo errado" },
    ...Array.from({ length: 20 }, (_, i) => ({ front: `Conceito número ${i}`, back: "Resposta." })),
  ];
  const valid = validateFlashcards(raw, 5);
  assert.equal(valid.length, 5);
  assert.deepEqual(valid.slice(0, 2), [{ front: "O que é limite?", back: "Valor de aproximação." }, { front: "Qué é derivada?", back: "Taxa de variação." }]);
  assert.deepEqual(validateFlashcards(null, 10), []);
  assert.deepEqual(validateFlashcards({ cards: [] }, 10), []);
});

test("flashcards pela API: criar, limite do plano, estudar, revisar e posse", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  const app = express();
  app.use(express.json());
  app.use(mainRouter);
  app.use(ErrorMiddleware);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}`;

  const mk = (name: string, plan?: string) =>
    prisma.user.create({ data: { name, email: `fc-${name}-${randomUUID()}@example.invalid`, passwordHash: "x", ...(plan ? { plan } : {}) } });
  const free = await mk("free");
  const other = await mk("other", "PRO");
  const tokenOf = (id: string) => jwt.sign({ id }, process.env.JWT_SECRET!, { expiresIn: "5m" });
  async function call(token: string, path: string, method = "GET", input?: unknown) {
    const response = await fetch(url + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
  }
  const token = tokenOf(free.id);
  // Conta nova ganha Pro de teste; tira para valer o limite do gratuito.
  await prisma.user.update({ where: { id: free.id }, data: { plan: "FREE", trialEndsAt: null } });

  setFlashcardModelClient(async ({ count }) => ({
    cards: Array.from({ length: count }, (_, i) => ({ front: `Pergunta ${i}?`, back: `Resposta ${i}.` })),
    model: "fake-model",
    inputTokens: 100,
    outputTokens: 50,
  }));

  try {
    const discipline = await prisma.discipline.create({ data: { name: "Cálculo", workloadHours: 60, gradingSystem: "WEIGHTED", userId: free.id } });
    // Gratuito não envia arquivos; o texto vem de um material já extraído.
    await prisma.material.create({
      data: { title: "Limites.txt", type: "FILE", url: "", userId: free.id, disciplineId: discipline.id, textContent: "Limite é o valor de que f(x) se aproxima. ".repeat(20), textExtractedAt: new Date() },
    });

    assert.equal((await call(token, "/flashcards/decks", "POST", { disciplineId: discipline.id, count: 15 })).status, 400);
    const created = await call(token, "/flashcards/decks", "POST", { disciplineId: discipline.id, count: 10 });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const deck = created.body.data;
    assert.equal(deck.cardCount, 10);
    assert.match(deck.title, /^Cálculo — \d{2}\/\d{2}$/);

    const limited = await call(token, "/flashcards/decks", "POST", { disciplineId: discipline.id, count: 10 });
    assert.equal(limited.status, 429);
    assert.match(limited.body.message, /Você já gerou os 1 baralhos do mês\. O limite renova em \d{2}\/\d{2}\/\d{4}\./);

    const list = await call(token, `/flashcards/decks?disciplineId=${discipline.id}`);
    assert.equal(list.body.data.decks.length, 1);
    assert.deepEqual(
      [list.body.data.decks[0].cardCount, list.body.data.decks[0].dueCount, list.body.data.decks[0].disciplineName],
      [10, 10, "Cálculo"],
    );
    assert.deepEqual([list.body.data.usage.used, list.body.data.usage.limit], [1, 1]);

    const detail = await call(token, `/flashcards/decks/${deck.id}`);
    assert.equal(detail.body.data.cards.length, 10);
    assert.deepEqual(Object.keys(detail.body.data.cards[0]).sort(), ["back", "dueAt", "front", "id", "reps"]);

    const study = await call(token, `/flashcards/decks/${deck.id}/study`);
    assert.equal(study.body.data.cards.length, 10);
    assert.equal(study.body.data.total, 10);

    const cardId = study.body.data.cards[0].id;
    const reviewed = await call(token, `/flashcards/cards/${cardId}/review`, "POST", { grade: "good" });
    assert.equal(reviewed.status, 200);
    assert.deepEqual([reviewed.body.data.reps, reviewed.body.data.intervalDays, reviewed.body.data.ease], [1, 1, 2.5]);
    assert.equal((await call(token, `/flashcards/cards/${cardId}/review`, "POST", { grade: "meh" })).status, 400);
    const after = await call(token, `/flashcards/decks/${deck.id}/study`);
    assert.equal(after.body.data.total, 9);
    assert.equal(after.body.data.cards.length, 9);

    // "again" adia 10 min: o cartão não volta no estudo seguinte.
    const againId = after.body.data.cards[0].id;
    await call(token, `/flashcards/cards/${againId}/review`, "POST", { grade: "again" });
    const afterAgain = await call(token, `/flashcards/decks/${deck.id}/study`);
    assert.equal(afterAgain.body.data.cards.some((card: { id: string }) => card.id === againId), false);
    assert.equal(afterAgain.body.data.total, 8);

    // Posse: outro usuário não vê, não estuda, não revisa, não apaga.
    const otherToken = tokenOf(other.id);
    assert.equal((await call(otherToken, `/flashcards/decks/${deck.id}`)).status, 404);
    assert.equal((await call(otherToken, `/flashcards/decks/${deck.id}/study`)).status, 404);
    assert.equal((await call(otherToken, `/flashcards/cards/${cardId}/review`, "POST", { grade: "good" })).status, 404);
    assert.equal((await call(otherToken, `/flashcards/decks/${deck.id}`, "DELETE")).status, 404);
    assert.equal((await call(otherToken, "/flashcards/decks", "POST", { disciplineId: discipline.id, count: 10 })).status, 403);

    assert.equal((await call(token, `/flashcards/decks/${deck.id}`, "DELETE")).status, 200);
    assert.equal((await call(token, `/flashcards/decks/${deck.id}`)).status, 404);
    assert.equal(await prisma.flashcard.count({ where: { deckId: deck.id } }), 0);

    // Modelo devolve lixo: FAILED, 503 e não conta no limite.
    setFlashcardModelClient(async () => ({ cards: [{ front: "?", back: "" }], model: "fake-model", inputTokens: 1, outputTokens: 1 }));
    assert.equal((await call(token, "/flashcards/decks", "POST", { disciplineId: discipline.id, count: 10 })).status, 503);
    assert.equal(await prisma.flashcardDeck.count({ where: { userId: free.id, status: "FAILED" } }), 1);
  } finally {
    setFlashcardModelClient(null);
    await prisma.material.deleteMany({ where: { userId: { in: [free.id, other.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [free.id, other.id] } } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
