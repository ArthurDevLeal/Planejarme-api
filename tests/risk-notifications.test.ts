import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.ts";
import { FindNotificationsByUserService } from "../src/services/notification-service.ts";
import {
  GenerateRiskNotificationsService,
  RefreshRiskForDiscipline,
  isoWeek,
  riskNotificationsFor,
} from "../src/services/risk-notification-service.ts";

const DAY_MS = 86_400_000;
const dbOnly = { skip: process.env.RUN_DB_TESTS !== "1" };

test("semana ISO", () => {
  assert.equal(isoWeek("2026-11-16"), "2026-W47");
  assert.equal(isoWeek("2026-11-22"), "2026-W47");
  assert.equal(isoWeek("2027-01-01"), "2026-W53");
  assert.equal(isoWeek("2025-12-29"), "2026-W01");
});

test("tipo do aviso por veredito e contagem regressiva de faltas", () => {
  const discipline = { id: "d1", name: "Cálculo II" };
  const base = { reason: "x", absencesLimit: 15 };
  const of = (status: Parameters<typeof riskNotificationsFor>[1]["status"]) => riskNotificationsFor("u", { discipline, status }, "2026-W47");

  assert.deepEqual(of({ ...base, verdict: "SAFE", cause: "GRADE", absencesLeft: 10 }), []);
  assert.deepEqual(of({ ...base, verdict: "FINAL", cause: "GRADE", absencesLeft: 10 }).map((n) => [n.type, n.dedupeKey]), [["FINAL_EXAM", "risk:d1:FINAL:2026-W47"]]);
  assert.deepEqual(of({ ...base, verdict: "RISK", cause: "ABSENCE", absencesLeft: 1 }).map((n) => [n.type, n.dedupeKey, n.message]), [
    ["RISK_ABSENCE", "risk:d1:RISK:2026-W47", "x"],
    ["RISK_ABSENCE", "absleft:d1:1", "Você pode faltar mais 1 aula de Cálculo II."],
  ]);
  assert.equal(of({ ...base, verdict: "ATTENTION", cause: "GRADE", absencesLeft: 0 })[1].message, "Você não pode faltar mais nenhuma aula de Cálculo II.");
  assert.equal(of({ ...base, verdict: "FAILED_ABSENCE", cause: "ABSENCE", absencesLeft: -1 }).length, 1);
  assert.deepEqual(of({ reason: "x", absencesLimit: 0, verdict: "SAFE", cause: null, absencesLeft: 0 }), []);
});

async function riskyUser(riskEmails: boolean) {
  const user = await prisma.user.create({
    data: { name: "Ana Risco", email: `risk-${randomUUID()}@example.invalid`, passwordHash: "x", riskEmails },
  });
  const now = Date.now();
  const semester = await prisma.semester.create({
    data: { name: "2026.2", startDate: new Date(now - 60 * DAY_MS), endDate: new Date(now + 30 * DAY_MS), isCurrent: true, userId: user.id },
  });
  const discipline = await prisma.discipline.create({
    data: { name: "Cálculo II", workloadHours: 60, userId: user.id, semesterId: semester.id },
  });
  // 2 na P1 com média 7: precisaria de 12 na P2 -> RISK por nota.
  await prisma.evaluation.createMany({
    data: [
      { title: "P1", score: 2, date: new Date(now - 10 * DAY_MS), disciplineId: discipline.id },
      { title: "P2", date: new Date(now + 10 * DAY_MS), disciplineId: discipline.id },
    ],
  });
  return { user, discipline };
}

test("Fase 2: mudança de nível gera um aviso, repetir não duplica, faltas fazem contagem regressiva", dbOnly, async () => {
  const { user, discipline } = await riskyUser(false);
  const sent: unknown[] = [];
  const options = { send: async (mail: unknown) => void sent.push(mail), userIds: [user.id] };
  try {
    const first = await GenerateRiskNotificationsService(new Date(), options);
    assert.equal(first.created, 1);
    const [notification] = await prisma.notification.findMany({ where: { userId: user.id } });
    assert.equal(notification.type, "RISK_GRADE");
    assert.equal(notification.title, "Cálculo II");
    assert.match(notification.dedupeKey ?? "", new RegExp(`^risk:${discipline.id}:RISK:\\d{4}-W\\d{2}$`));

    assert.equal((await GenerateRiskNotificationsService(new Date(), options)).created, 0);
    assert.equal(sent.length, 0, "riskEmails=false não manda e-mail");

    // Limite 15 (25% de 60). 13 faltas -> pode faltar mais 2.
    await prisma.discipline.update({ where: { id: discipline.id }, data: { absences: 13 } });
    await RefreshRiskForDiscipline(user.id, discipline.id);
    await prisma.discipline.update({ where: { id: discipline.id }, data: { absences: 15 } });
    await RefreshRiskForDiscipline(user.id, discipline.id);
    await RefreshRiskForDiscipline(user.id, discipline.id);
    const countdown = await prisma.notification.findMany({ where: { userId: user.id, dedupeKey: { startsWith: "absleft:" } }, orderBy: { dedupeKey: "desc" } });
    assert.deepEqual(countdown.map((item) => item.message), [
      "Você pode faltar mais 2 aulas de Cálculo II.",
      "Você não pode faltar mais nenhuma aula de Cálculo II.",
    ]);
    assert.equal(await prisma.notification.count({ where: { userId: user.id } }), 3);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("Fase 2: um e-mail de resumo por dia para quem tem riskEmails", dbOnly, async () => {
  const { user, discipline } = await riskyUser(true);
  const sent: { to: string; subject: string; text: string }[] = [];
  const options = { send: async (mail: { to: string; subject: string; text: string; html: string }) => void sent.push(mail), userIds: [user.id] };
  try {
    // Aviso criado na hora (ao lançar a nota) também conta como "novo hoje" para o e-mail do cron.
    await RefreshRiskForDiscipline(user.id, discipline.id);
    assert.equal((await GenerateRiskNotificationsService(new Date(), options)).emailed, 1);
    assert.equal((await GenerateRiskNotificationsService(new Date(), options)).emailed, 0);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, user.email);
    assert.equal(sent[0].subject, "Cálculo II precisa de atenção");
    assert.match(sent[0].text, /Cálculo II: Não dá mais para passar direto/);
    assert.match(sent[0].text, new RegExp(`/dashboard/disciplinas/${discipline.id}`));
    assert.match(sent[0].text, /\/dashboard\/configuracoes/);
    // A marca do e-mail não aparece no sino.
    const listed = await FindNotificationsByUserService(user.id);
    assert.deepEqual(listed.map((item) => item.type), ["RISK_GRADE"]);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
