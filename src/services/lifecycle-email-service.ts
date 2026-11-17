import { prisma } from "../../lib/prisma.ts";
import { webUrl } from "../config/billing.ts";
import { TRIAL_DAYS } from "../config/plans.ts";
import { SendEmail } from "../lib/email.ts";
import { escapeHtml, renderEmail } from "../lib/email-layout.ts";
import { brasiliaDate } from "../utils/academic-date.ts";
import { isoWeek } from "./risk-notification-service.ts";

const USER_BATCH = 200;
const DAY_MS = 86_400_000;
const MAX_ITEMS = 10;
/** Primeiro nome sem espaços sobrando; vazio vira undefined (sem saudação). */
export const firstName = (name: string) => name.trim().split(/s+/)[0] || undefined;

// ---------- Boas-vindas ----------

/** Aguardado pelo cadastro (a função serverless congela depois da resposta), mas uma falha só vai para o log. */
export async function SendWelcomeEmail(user: { name: string; email: string }) {
  const { html, text } = renderEmail({
    preheader: `Seu Pro está liberado por ${TRIAL_DAYS} dias.`,
    greetingName: firstName(user.name),
    paragraphs: [
      `Bem-vindo ao Planejar.me! Você ganhou o Pro grátis por ${TRIAL_DAYS} dias, com tudo liberado.`,
      "Para começar, faça estes 3 passos:",
    ],
    list: ["Cadastre seu semestre e suas disciplinas", "Envie seus materiais de estudo", "Gere um simulado"],
    cta: { label: "Abrir o Planejar.me", url: `${webUrl()}/dashboard/visao-hoje` },
    footer: "Você recebeu este e-mail porque criou uma conta no Planejar.me.",
  });
  try {
    await SendEmail({ to: user.email, subject: "Bem-vindo ao Planejar.me", html, text });
  } catch (error) {
    console.error("[email] boas-vindas", error);
  }
}

// ---------- Trial ----------

export type TrialKind = "ending" | "ended";

/** Janela (gt, lte] de trialEndsAt: termina entre 24h e 48h, ou terminou nas últimas 24h. */
export function trialWindow(kind: TrialKind, now: Date) {
  const t = now.getTime();
  return kind === "ending"
    ? { gt: new Date(t + DAY_MS), lte: new Date(t + 2 * DAY_MS) }
    : { gt: new Date(t - DAY_MS), lte: now };
}

function trialEmail(kind: TrialKind, name: string) {
  const url = `${webUrl()}/dashboard/configuracoes?secao=plano`;
  const ending = kind === "ending";
  return {
    subject: ending ? "Seu teste do Pro termina em até 2 dias" : "Seu teste do Pro terminou",
    ...renderEmail({
      preheader: ending ? "Assine para manter o Pro." : "Sua conta voltou ao plano gratuito.",
      greetingName: firstName(name),
      paragraphs: [
        ending
          ? "Seu teste grátis do Pro termina em até 2 dias. Para manter simulados, materiais e tudo mais sem interrupção, escolha seu plano."
          : "Seu teste grátis do Pro terminou e sua conta está no plano gratuito. Seus dados continuam salvos. Assine quando quiser para voltar ao Pro.",
      ],
      cta: { label: "Ver planos", url },
      footer: "Você recebeu este e-mail por ter feito o teste do Planejar.me.",
    }),
  };
}

/** Marca (lida, fora das listas) criada antes de enviar: quem já tem a marca não recebe de novo. */
async function claim(userId: string, dedupeKey: string, title: string) {
  const result = await prisma.notification.createMany({
    data: [{ userId, type: "LIFECYCLE_EMAIL", title, message: "E-mail enviado.", dedupeKey, read: true }],
    skipDuplicates: true,
  });
  return result.count > 0;
}

/** Usuários em páginas de 200 com cursor por id; falha de um usuário só vai para o log. */
async function forEachUser<T extends { id: string }>(page: (cursor?: string) => Promise<T[]>, run: (user: T) => Promise<void>, label: string) {
  let cursor: string | undefined;
  for (;;) {
    const users = await page(cursor);
    for (const user of users) {
      try {
        await run(user);
      } catch (error) {
        console.error(label, user.id, error);
      }
    }
    if (users.length < USER_BATCH) break;
    cursor = users[users.length - 1].id;
  }
}

export async function SendTrialEmailsService(now = new Date(), { send = SendEmail }: { send?: typeof SendEmail } = {}) {
  const sent = { ending: 0, ended: 0 };
  for (const kind of ["ending", "ended"] as const) {
    await forEachUser(
      (cursor) => prisma.user.findMany({
        where: { plan: { not: "PRO" }, trialEndsAt: trialWindow(kind, now) },
        select: { id: true, name: true, email: true },
        orderBy: { id: "asc" },
        take: USER_BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      async (user) => {
        if (!(await claim(user.id, `trialmail:${kind}`, "E-mail do teste"))) return;
        const { subject, html, text } = trialEmail(kind, user.name);
        await send({ to: user.email, subject, html, text });
        sent[kind]++;
      },
      "[trial-email] falha no usuário",
    );
  }
  return sent;
}

// ---------- Pagamento recusado ----------

export async function SendPaymentFailedEmail(user: { name: string; email: string }, send = SendEmail) {
  const { html, text } = renderEmail({
    preheader: "Confira a forma de pagamento.",
    greetingName: firstName(user.name),
    paragraphs: ["Não conseguimos cobrar sua assinatura. Seu acesso continua por enquanto e vamos tentar de novo, mas vale conferir a forma de pagamento para não perder o Pro."],
    cta: { label: "Ver minha assinatura", url: `${webUrl()}/dashboard/configuracoes?secao=plano` },
    footer: "Você recebeu este e-mail porque há uma cobrança pendente na sua assinatura.",
  });
  await send({ to: user.email, subject: "Não conseguimos cobrar sua assinatura", html, text });
}

// ---------- Resumo semanal ----------

export const isMondayInBrasilia = (now: Date) => new Date(`${brasiliaDate(now)}T00:00:00Z`).getUTCDay() === 1;

const dayMonth = (date: Date) => brasiliaDate(date).split("-").reverse().slice(0, 2).join("/");

/** Ordena por data, corta em 10 e devolve "dd/mm - rótulo" com o texto do usuário escapado. */
export function digestItems(rows: { date: Date; label: string }[]): string[] {
  return [...rows]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, MAX_ITEMS)
    .map((row) => `${dayMonth(row.date)} - ${escapeHtml(row.label)}`);
}

/** Só quem tem tarefa pendente ou avaliação sem nota na janela entra na paginação. */
export function weeklyUsersWhere(range: { gte: Date; lt: Date }, userIds?: string[]) {
  return {
    weeklyEmails: true,
    ...(userIds ? { id: { in: userIds } } : {}),
    OR: [
      { tasks: { some: { status: { not: "COMPLETED" }, deletedAt: null, dueDate: range } } },
      { disciplines: { some: { semester: { isCurrent: true }, evaluations: { some: { score: null, date: range } } } } },
    ],
  };
}

export async function SendWeeklyDigestService(now = new Date(), { send = SendEmail, userIds }: { send?: typeof SendEmail; userIds?: string[] } = {}) {
  if (!isMondayInBrasilia(now)) return { emailed: 0 };
  let emailed = 0;
  const today = brasiliaDate(now);
  // shortcut: Brasília é UTC-3 fixo, como no resumo de risco.
  const from = new Date(`${today}T03:00:00Z`);
  const range = { gte: from, lt: new Date(from.getTime() + 7 * DAY_MS) };
  const week = isoWeek(today);
  const base = webUrl();

  await forEachUser(
    (cursor) => prisma.user.findMany({
      where: weeklyUsersWhere(range, userIds),
      select: { id: true, name: true, email: true },
      orderBy: { id: "asc" },
      take: USER_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    async (user) => {
      const [tasks, evaluations] = await Promise.all([
        prisma.task.findMany({
          where: { userId: user.id, status: { not: "COMPLETED" }, deletedAt: null, dueDate: range },
          select: { title: true, dueDate: true },
          orderBy: { dueDate: "asc" },
          take: MAX_ITEMS,
        }),
        prisma.evaluation.findMany({
          where: { score: null, date: range, discipline: { userId: user.id, semester: { isCurrent: true } } },
          select: { title: true, date: true, discipline: { select: { name: true } } },
          orderBy: { date: "asc" },
          take: MAX_ITEMS,
        }),
      ]);
      if (!tasks.length && !evaluations.length) return;
      if (!(await claim(user.id, `weeklymail:${week}`, "Resumo semanal"))) return;

      const list = [
        ...digestItems(tasks.map((task) => ({ date: task.dueDate, label: task.title }))).map((line) => `Tarefa: ${line}`),
        ...digestItems(evaluations.map((item) => ({ date: item.date, label: `${item.title} (${item.discipline.name})` }))).map((line) => `Avaliação: ${line}`),
      ];
      const { html, text } = renderEmail({
        preheader: "Suas tarefas e avaliações da semana.",
        greetingName: firstName(user.name),
        paragraphs: ["Veja o que vem por aí nos próximos 7 dias:"],
        list,
        cta: { label: "Abrir o Planejar.me", url: `${base}/dashboard/visao-hoje` },
        footer: `Para não receber mais, desative em <a href="${base}/dashboard/configuracoes">Configurações &gt; Preferências</a>.`,
      });
      await send({ to: user.email, subject: "Sua semana no Planejar.me", html, text });
      emailed++;
    },
    "[weekly-email] falha no usuário",
  );
  return { emailed };
}
