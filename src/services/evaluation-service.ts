import { prisma } from "../../lib/prisma.ts";
import { CreateEvaluationSchemaType, UpdateEvaluationSchemaType } from "../schemas/evaluation-schema.ts";

import { BadRequestsException } from "../exceptions/bad-requests.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { currentAverage } from "../domain/approval.ts";

/** Uma prova final por disciplina: é ela que a regra de aprovação usa. */
async function assertSingleFinal(disciplineId: string, exceptId?: string) {
  const other = await prisma.evaluation.findFirst({
    where: { disciplineId, kind: "FINAL", ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (other) {
    throw new BadRequestsException("Esta disciplina já tem uma prova final cadastrada.", ErrorCode.INVALID_DATA);
  }
}

export async function CreateEvaluationService(data: CreateEvaluationSchemaType) {
  if (data.kind === "FINAL") await assertSingleFinal(data.disciplineId);
  return prisma.evaluation.create({ data });
}

export function FindEvaluationByIdService(id: string) {
  return prisma.evaluation.findUnique({ where: { id } });
}

export function FindEvaluationsByDisciplineService(disciplineId: string) {
  return prisma.evaluation.findMany({
    where: { disciplineId },
    orderBy: { date: "asc" },
  });
}

const TARGET_WEIGHT = 10;

export async function FindEvaluationSummaryService(disciplineId: string) {
  const [evaluations, discipline] = await Promise.all([
    prisma.evaluation.findMany({ where: { disciplineId }, orderBy: { date: "asc" } }),
    prisma.discipline.findUnique({ where: { id: disciplineId }, select: { gradingSystem: true } }),
  ]);
  const gradedEvaluations = evaluations.filter((evaluation) => evaluation.score !== null);
  const totalWeight = gradedEvaluations.reduce((total, evaluation) => total + evaluation.weight, 0);
  // Média das avaliações regulares com a mesma conta do painel (aritmética ignora o peso).
  const weightedScore = currentAverage(
    evaluations
      .filter((evaluation) => evaluation.kind !== "FINAL")
      .map((evaluation) => ({ ...evaluation, date: evaluation.date.toISOString().slice(0, 10) })),
    discipline?.gradingSystem === "WEIGHTED" ? "WEIGHTED" : "ARITHMETIC",
  );

  const plannedWeight = evaluations.reduce((total, evaluation) => total + evaluation.weight, 0);
  const weightStatus =
    discipline?.gradingSystem !== "WEIGHTED"
      ? null
      : Math.abs(plannedWeight - TARGET_WEIGHT) < 1e-6
        ? "COMPLETE"
        : plannedWeight < TARGET_WEIGHT
          ? "INCOMPLETE"
          : "EXCEEDED";

  return { evaluations, gradedCount: gradedEvaluations.length, totalWeight, weightedScore, plannedWeight, weightStatus };
}

export async function UpdateEvaluationService(id: string, data: UpdateEvaluationSchemaType) {
  if (data.kind === "FINAL") {
    const current = await prisma.evaluation.findUnique({ where: { id }, select: { disciplineId: true } });
    if (current) await assertSingleFinal(current.disciplineId, id);
  }
  return prisma.evaluation.update({ where: { id }, data });
}

export function DeleteEvaluationService(id: string) {
  return prisma.evaluation.delete({ where: { id } });
}
