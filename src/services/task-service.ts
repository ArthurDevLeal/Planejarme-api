import { prisma } from "../../lib/prisma.ts";
import { CreateTaskSchemaType, UpdateTaskSchemaType } from "../schemas/task-schema.ts";

import { storedTaskStatus, withTaskStatus } from "../utils/task-status.ts";
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
  return withTaskStatus(await prisma.task.create({
    data: {
      ...data,
      ...(data.status !== undefined ? { status: storedTaskStatus(data.status) } : {}),
      semesterId,
    },
  }));
}

export async function FindTaskByIdService(id: string) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: { discipline: { select: { id: true, name: true } } },
  });
  return task && withTaskStatus(task);
}

export async function FindTasksByUserService(userId: string, semesterId?: string) {
  const tasks = await prisma.task.findMany({
    where: { userId, ...(semesterId ? { semesterId } : {}) },
    include: { discipline: { select: { id: true, name: true } } },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
  });
  return tasks.map((task) => withTaskStatus(task));
}

export async function FindPendingTasksByUserService(userId: string, semesterId?: string) {
  const tasks = await prisma.task.findMany({
    where: { userId, status: { not: "COMPLETED" }, ...(semesterId ? { semesterId } : {}) },
    include: { discipline: { select: { id: true, name: true } } },
    orderBy: { dueDate: "asc" },
  });
  return tasks.map((task) => withTaskStatus(task));
}

export async function UpdateTaskService(id: string, data: UpdateTaskSchemaType) {
  return withTaskStatus(await prisma.task.update({ where: { id }, data: {
    ...data,
    ...(data.status !== undefined
      ? { status: storedTaskStatus(data.status), completedAt: data.status === "COMPLETED" ? new Date() : null }
      : {}),
  } }));
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
