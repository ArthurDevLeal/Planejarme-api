import { prisma } from "../../lib/prisma.ts";
import { CreateEvaluationSchemaType, UpdateEvaluationSchemaType } from "../schemas/evaluation-schema.ts";

export function CreateEvaluationService(data: CreateEvaluationSchemaType) {
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

export async function FindEvaluationSummaryService(disciplineId: string) {
  const evaluations = await prisma.evaluation.findMany({
    where: { disciplineId },
    orderBy: { date: "asc" },
  });
  const gradedEvaluations = evaluations.filter((evaluation) => evaluation.score !== null);
  const totalWeight = gradedEvaluations.reduce((total, evaluation) => total + evaluation.weight, 0);
  const weightedScore = totalWeight
    ? gradedEvaluations.reduce((total, evaluation) => total + evaluation.score! * evaluation.weight, 0) /
      totalWeight
    : null;

  return { evaluations, gradedCount: gradedEvaluations.length, totalWeight, weightedScore };
}

export function UpdateEvaluationService(id: string, data: UpdateEvaluationSchemaType) {
  return prisma.evaluation.update({ where: { id }, data });
}

export function DeleteEvaluationService(id: string) {
  return prisma.evaluation.delete({ where: { id } });
}
