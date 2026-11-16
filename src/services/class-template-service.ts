import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.ts";
import { describeRule, resolveRule } from "../domain/approval.ts";
import { BadRequestsException } from "../exceptions/bad-requests.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { brasiliaDate } from "../utils/academic-date.ts";
import { assertDisciplineSlots } from "./plan-service.ts";
import { EnsureUserHasCurrentSemester, attendanceAnchorForSemester } from "./semester-service.ts";

const templateFields = { token: true, importCount: true, createdAt: true } as const;
const firstName = (name: string) => name.trim().split(/\s+/)[0];
const unavailable = () => new NotFoundException("Este link da turma não existe mais.", ErrorCode.NOT_FOUND);

/** O link da turma é grátis: não passa pelo ProOnlyWrites. Um por disciplina; chamar de novo devolve o mesmo. */
export async function CreateOrGetClassTemplateService(ownerId: string, disciplineId: string) {
  return prisma.classTemplate.upsert({
    where: { disciplineId },
    update: {},
    create: { token: crypto.randomBytes(24).toString("base64url"), disciplineId, ownerId },
    select: templateFields,
  });
}

export function GetClassTemplateService(disciplineId: string) {
  return prisma.classTemplate.findUnique({ where: { disciplineId }, select: { token: true, importCount: true } });
}

export async function RevokeClassTemplateService(ownerId: string, disciplineId: string) {
  const { count } = await prisma.classTemplate.deleteMany({ where: { disciplineId, ownerId } });
  if (count === 0) throw new NotFoundException("Este link da turma já foi desativado.", ErrorCode.NOT_FOUND);
}

/** Só o que a turma compartilha: nunca notas, faltas, arquivos nem o e-mail do dono. */
async function loadTemplate(token: string) {
  const template = await prisma.classTemplate.findUnique({
    where: { token },
    include: {
      owner: { select: { name: true, passingScore: true, maxAbsencePct: true, referralCode: true, affiliateStatus: true } },
      discipline: {
        select: {
          name: true, professor: true, classroom: true, workloadHours: true, gradingSystem: true, color: true, icon: true,
          passingScore: true, maxAbsencePct: true, hasFinalExam: true, finalMinAverage: true, finalPassingScore: true, finalExamWeight: true,
          schedules: { select: { dayOfWeek: true, startTime: true, endTime: true }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
          evaluations: { select: { title: true, weight: true, date: true, kind: true }, orderBy: { date: "asc" } },
        },
      },
    },
  });
  if (!template) throw unavailable();
  const { discipline, owner } = template;
  // A regra da turma vai resolvida: nulo herdaria o padrão de quem importa, não o do dono.
  const rule = {
    gradingSystem: discipline.gradingSystem,
    passingScore: discipline.passingScore ?? owner.passingScore,
    maxAbsencePct: discipline.maxAbsencePct ?? owner.maxAbsencePct,
    hasFinalExam: discipline.hasFinalExam,
    finalMinAverage: discipline.finalMinAverage,
    finalPassingScore: discipline.finalPassingScore,
    finalExamWeight: discipline.finalExamWeight,
  };
  return { template, discipline, owner, rule };
}

export async function GetClassTemplatePreviewService(token: string) {
  const { template, discipline, owner, rule } = await loadTemplate(token);
  return {
    disciplineName: discipline.name,
    ownerFirstName: firstName(owner.name),
    professor: discipline.professor,
    classroom: discipline.classroom,
    workloadHours: discipline.workloadHours,
    color: discipline.color,
    icon: discipline.icon,
    schedules: discipline.schedules,
    evaluations: discipline.evaluations.map((item) => ({ ...item, date: item.date.toISOString().slice(0, 10) })),
    ...rule,
    ruleText: describeRule(resolveRule(rule, { passingScore: rule.passingScore, maxAbsencePct: rule.maxAbsencePct }), discipline.workloadHours),
    importCount: template.importCount,
    ownerReferralCode: owner.affiliateStatus === "ACTIVE" && owner.referralCode ? owner.referralCode : null,
  };
}

export async function ImportClassTemplateService(userId: string, token: string) {
  const { template, discipline, rule } = await loadTemplate(token);
  if (template.ownerId === userId) {
    throw new BadRequestsException("Esta disciplina já é sua. Mande o link para os colegas da turma importarem.", ErrorCode.INVALID_DATA);
  }
  const existing = await prisma.discipline.findFirst({ where: { userId, importedFromTemplateId: template.id }, select: { id: true } });
  if (existing) return { disciplineId: existing.id, alreadyImported: true };

  const semester = await EnsureUserHasCurrentSemester(userId);
  await assertDisciplineSlots(userId, semester.id);
  // Faltas contam a partir de hoje: quem importa no meio do semestre não herda aulas passadas.
  const anchor = await attendanceAnchorForSemester(semester.id);
  const today = new Date(`${brasiliaDate()}T00:00:00Z`);
  const attendanceSince = anchor > today ? anchor : today;

  // shortcut: sem índice único (userId, importedFromTemplateId), dois imports simultâneos podem duplicar; o rate limit segura o caso comum.
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.discipline.create({
      data: {
        name: discipline.name,
        professor: discipline.professor,
        classroom: discipline.classroom,
        workloadHours: discipline.workloadHours,
        color: discipline.color,
        icon: discipline.icon,
        ...rule,
        importedFromTemplateId: template.id,
        userId,
        semesterId: semester.id,
        schedules: { create: discipline.schedules.map((item) => ({ ...item, attendanceSince })) },
        evaluations: { create: discipline.evaluations.map((item) => ({ ...item, score: null })) },
      },
      select: { id: true },
    });
    await tx.classTemplate.update({ where: { id: template.id }, data: { importCount: { increment: 1 } } });
    return row;
  });
  return { disciplineId: created.id, alreadyImported: false };
}
