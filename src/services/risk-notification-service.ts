import { prisma } from "../../lib/prisma.ts";
import { webUrl } from "../config/billing.ts";
import type { DisciplineStatus, Verdict } from "../domain/approval.ts";
import { SendEmail } from "../lib/email.ts";
import { brasiliaDate } from "../utils/academic-date.ts";
import { GetDisciplineStatusesService } from "./discipline-status-service.ts";

const ALERT_VERDICTS: Verdict[] = ["ATTENTION", "RISK", "FINAL", "FAILED_GRADE", "FAILED_ABSENCE"];
const EMAIL_VERDICTS: Verdict[] = ["RISK", "FAILED_GRADE", "FAILED_ABSENCE"];
const USER_BATCH = 200;

type RiskStatus = Pick<DisciplineStatus, "verdict" | "cause" | "reason" | "absencesLeft" | "absencesLimit">;
type RiskRow = { discipline: { id: string; name: string }; status: RiskStatus };

/** "2026-W47" a partir de YYYY-MM-DD. */
export function isoWeek(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  const week = Math.ceil(((date.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

const riskKey = (disciplineId: string, verdict: Verdict, week: string) => `risk:${disciplineId}:${verdict}:${week}`;

/** Avisos de uma disciplina: um por nível de risco por semana e a contagem regressiva de faltas (2, 1, 0), uma vez cada. */
export function riskNotificationsFor(userId: string, { discipline, status }: RiskRow, week: string) {
  const rows: { userId: string; type: string; title: string; message: string; dedupeKey: string }[] = [];
  if (ALERT_VERDICTS.includes(status.verdict)) {
    const type = status.verdict === "FINAL" ? "FINAL_EXAM" : status.cause === "ABSENCE" ? "RISK_ABSENCE" : "RISK_GRADE";
    rows.push({ userId, type, title: discipline.name, message: status.reason, dedupeKey: riskKey(discipline.id, status.verdict, week) });
  }
  const left = status.absencesLeft;
  if (status.absencesLimit > 0 && left >= 0 && left <= 2) {
    const message = left === 0
      ? `Você não pode faltar mais nenhuma aula de ${discipline.name}.`
      : `Você pode faltar mais ${left} ${left === 1 ? "aula" : "aulas"} de ${discipline.name}.`;
    rows.push({ userId, type: "RISK_ABSENCE", title: discipline.name, message, dedupeKey: `absleft:${discipline.id}:${left}` });
  }
  return rows;
}

async function refreshUser(userId: string, now: Date, disciplineId?: string) {
  const all = await GetDisciplineStatusesService(userId, disciplineId);
  const rows = all.filter((row) => row.discipline.semester?.isCurrent);
  const week = isoWeek(brasiliaDate(now));
  const data = rows.flatMap((row) => riskNotificationsFor(userId, row, week));
  const created = data.length ? (await prisma.notification.createMany({ data, skipDuplicates: true })).count : 0;
  return { rows, created, week };
}

/** Recalcula uma disciplina logo depois de presença, nota ou edição. Só aviso no app; e-mail fica com o cron. Nunca derruba a requisição. */
export async function RefreshRiskForDiscipline(userId: string, disciplineId: string) {
  try {
    await refreshUser(userId, new Date(), disciplineId);
  } catch (error) {
    console.error("[risk] falha ao recalcular disciplina", disciplineId, error);
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

type DigestUser = { id: string; name: string; email: string };

/** Um resumo por dia, só se algum aviso de RISK/FAILED_* nasceu hoje (no cron ou na hora, ao marcar presença/nota). */
async function sendDigest(user: DigestUser, rows: RiskRow[], week: string, now: Date, send: typeof SendEmail) {
  const atRisk = rows.filter((row) => EMAIL_VERDICTS.includes(row.status.verdict));
  if (!atRisk.length) return false;
  const today = brasiliaDate(now);
  // shortcut: Brasília é UTC-3 fixo (sem horário de verão desde 2019); trocar se voltar.
  const dayStart = new Date(`${today}T03:00:00Z`);
  const fresh = await prisma.notification.count({
    where: { userId: user.id, dedupeKey: { in: atRisk.map((row) => riskKey(row.discipline.id, row.status.verdict, week)) }, createdAt: { gte: dayStart } },
  });
  if (!fresh) return false;
  // A marca do dia (lida, fora das listas) impede um segundo e-mail se o cron rodar de novo.
  const claim = await prisma.notification.createMany({
    data: [{ userId: user.id, type: "RISK_DIGEST", title: "Resumo de risco", message: "Resumo enviado por e-mail.", dedupeKey: `riskmail:${today}`, read: true }],
    skipDuplicates: true,
  });
  if (!claim.count) return false;

  const base = webUrl();
  const lines = atRisk.map((row) => ({ text: `${row.discipline.name}: ${row.status.reason}`, link: `${base}/dashboard/disciplinas/${row.discipline.id}` }));
  const subject = atRisk.length === 1 ? `${atRisk[0].discipline.name} precisa de atenção` : `${atRisk.length} disciplinas precisam de atenção`;
  const firstName = user.name.split(" ")[0];
  const settings = `${base}/dashboard/configuracoes`;
  const text = [
    `Oi, ${firstName}.`,
    "",
    ...lines.flatMap((line) => [line.text, line.link, ""]),
    "Dá tempo de virar. Abra o Planejar.me para ver a conta completa.",
    "",
    `Não quer mais esses avisos por e-mail? Desligue em ${settings}`,
  ].join("\n");
  const html = [
    `<p>Oi, ${escapeHtml(firstName)}.</p>`,
    ...lines.map((line) => `<p>${escapeHtml(line.text)}<br><a href="${line.link}">${line.link}</a></p>`),
    "<p>Dá tempo de virar. Abra o Planejar.me para ver a conta completa.</p>",
    `<p style="color:#64748b;font-size:12px">Não quer mais esses avisos por e-mail? <a href="${settings}">Desligue em Configurações</a>.</p>`,
  ].join("");
  await send({ to: user.email, subject, text, html });
  return true;
}

/**
 * Cron diário: avisos de risco de todas as disciplinas de semestres atuais, em lotes de usuários.
 * `send` e `userIds` existem para os testes (stub de e-mail e não tocar nos outros usuários do banco).
 */
export async function GenerateRiskNotificationsService(
  now = new Date(),
  { send = SendEmail, userIds }: { send?: typeof SendEmail; userIds?: string[] } = {},
) {
  let created = 0;
  let emailed = 0;
  let cursor: string | undefined;
  for (;;) {
    const users = await prisma.user.findMany({
      where: { disciplines: { some: { semester: { isCurrent: true } } }, ...(userIds ? { id: { in: userIds } } : {}) },
      select: { id: true, name: true, email: true, riskEmails: true },
      orderBy: { id: "asc" },
      take: USER_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    // shortcut: um usuário por vez, sem limite de tempo da função; paralelizar ou retomar pelo cursor se o cron passar do tempo.
    for (const user of users) {
      try {
        const result = await refreshUser(user.id, now);
        created += result.created;
        if (user.riskEmails && (await sendDigest(user, result.rows, result.week, now, send))) emailed++;
      } catch (error) {
        console.error("[risk] falha nos avisos do usuário", user.id, error);
      }
    }
    if (users.length < USER_BATCH) break;
    cursor = users[users.length - 1].id;
  }
  return { created, emailed };
}
