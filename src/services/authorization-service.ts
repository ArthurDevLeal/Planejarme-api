import { prisma } from "../../lib/prisma.ts";
import { ForbiddenException } from "../exceptions/forbidden.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";

type Resource = "user" | "discipline" | "task" | "schedule" | "evaluation" | "semester";
function assertOwner(ownerId: string, userId: string) {
  if (ownerId !== userId) throw new ForbiddenException("Você não tem permissão para acessar este registro.", ErrorCode.FORBIDDEN);
}

export async function AuthorizeRequestService(
  userId: string, resource: Resource, params: Record<string, unknown>, body: unknown,
) {
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  for (const value of [params.userId, input.userId]) {
    if (typeof value === "string") assertOwner(value, userId);
  }
  if (resource === "user") {
    if (typeof params.id === "string") assertOwner(params.id, userId);
    return;
  }
  for (const semesterId of [params.semesterId, input.semesterId]) {
    if (typeof semesterId !== "string" || !semesterId) continue;
    const semester = await prisma.semester.findUnique({ where: { id: semesterId }, select: { userId: true } });
    if (!semester) throw new NotFoundException("Semestre não encontrado.", ErrorCode.SEMESTER_NOT_FOUND);
    assertOwner(semester.userId, userId);
  }
  for (const disciplineId of [params.disciplineId, input.disciplineId]) {
    if (typeof disciplineId !== "string" || !disciplineId) continue;
    const discipline = await prisma.discipline.findUnique({ where: { id: disciplineId }, select: { userId: true } });
    if (!discipline) throw new NotFoundException("Disciplina não encontrada.", ErrorCode.DISCIPLINE_NOT_FOUND);
    assertOwner(discipline.userId, userId);
  }
  if (typeof params.id !== "string") return;
  let owner: string | undefined;
  let code: ErrorCode;
  switch (resource) {
    case "semester": {
      owner = (await prisma.semester.findUnique({ where: { id: params.id }, select: { userId: true } }))?.userId;
      code = ErrorCode.SEMESTER_NOT_FOUND;
      break;
    }
    case "discipline": {
      owner = (await prisma.discipline.findUnique({ where: { id: params.id }, select: { userId: true } }))?.userId;
      code = ErrorCode.DISCIPLINE_NOT_FOUND;
      break;
    }
    case "task": {
      owner = (await prisma.task.findUnique({ where: { id: params.id }, select: { userId: true } }))?.userId;
      code = ErrorCode.TASK_NOT_FOUND;
      break;
    }
    case "schedule": {
      owner = (await prisma.schedule.findUnique({ where: { id: params.id }, select: { discipline: { select: { userId: true } } } }))?.discipline.userId;
      code = ErrorCode.SCHEDULE_NOT_FOUND;
      break;
    }
    case "evaluation": {
      owner = (await prisma.evaluation.findUnique({ where: { id: params.id }, select: { discipline: { select: { userId: true } } } }))?.discipline.userId;
      code = ErrorCode.EVALUATION_NOT_FOUND;
      break;
    }
  }
  if (!owner) throw new NotFoundException("Registro não encontrado.", code);
  assertOwner(owner, userId);
}
