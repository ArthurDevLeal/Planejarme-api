import { prisma } from "../../lib/prisma";
import { CreateTaskSchemaType, UpdateTaskSchemaType } from "../schemas/task-schema";

export function CreateTaskService(data: CreateTaskSchemaType) {
  return prisma.task.create({ data });
}

export function FindTaskByIdService(id: string) {
  return prisma.task.findUnique({
    where: { id },
    include: { discipline: { select: { id: true, name: true } } },
  });
}

export function FindTasksByUserService(userId: string) {
  return prisma.task.findMany({
    where: { userId },
    include: { discipline: { select: { id: true, name: true } } },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
  });
}

export function FindPendingTasksByUserService(userId: string) {
  return prisma.task.findMany({
    where: { userId, status: { not: "COMPLETED" } },
    include: { discipline: { select: { id: true, name: true } } },
    orderBy: { dueDate: "asc" },
  });
}

export function UpdateTaskService(id: string, data: UpdateTaskSchemaType) {
  return prisma.task.update({ where: { id }, data });
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
