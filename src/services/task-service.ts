import { prisma } from "../../lib/prisma.ts";
import { CreateTaskSchemaType, UpdateTaskSchemaType } from "../schemas/task-schema.ts";

import { EnsureUserHasCurrentSemester } from "./semester-service.ts";

export async function CreateTaskService(data: CreateTaskSchemaType) {
  let semesterId = data.semesterId;
  if (!semesterId && data.disciplineId) {
    const discipline = await prisma.discipline.findUnique({
      where: { id: data.disciplineId },
      select: { semesterId: true },
    });
    semesterId = discipline?.semesterId ?? undefined;
  }
  if (!semesterId) {
    const current = await EnsureUserHasCurrentSemester(data.userId);
    semesterId = current.id;
  }
  return prisma.task.create({
    data: {
      ...data,
      semesterId,
    },
  });
}

export function FindTaskByIdService(id: string) {
  return prisma.task.findUnique({
    where: { id },
    include: { discipline: { select: { id: true, name: true } } },
  });
}

export function FindTasksByUserService(userId: string, semesterId?: string) {
  return prisma.task.findMany({
    where: { userId, ...(semesterId ? { semesterId } : {}) },
    include: { discipline: { select: { id: true, name: true } } },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
  });
}

export function FindPendingTasksByUserService(userId: string, semesterId?: string) {
  return prisma.task.findMany({
    where: { userId, status: { not: "COMPLETED" }, ...(semesterId ? { semesterId } : {}) },
    include: { discipline: { select: { id: true, name: true } } },
    orderBy: { dueDate: "asc" },
  });
}

export function UpdateTaskService(id: string, data: UpdateTaskSchemaType) {
  return prisma.task.update({ where: { id }, data: {
    ...data,
    ...(data.status !== undefined ? { completedAt: data.status === "COMPLETED" ? new Date() : null } : {}),
  } });
}

export function CompleteTaskService(id: string) {
  return prisma.task.update({
    where: { id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}

export function DeleteTaskService(id: string) {
  return prisma.task.delete({ where: { id } });
}
