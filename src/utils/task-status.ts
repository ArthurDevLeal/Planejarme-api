import { brasiliaDate } from "./academic-date.ts";

export function withTaskStatus<T extends { status: string; dueDate: Date }>(task: T, now = new Date()): T {
  if (task.status === "PENDING" && brasiliaDate(task.dueDate) < brasiliaDate(now)) {
    return { ...task, status: "OVERDUE" };
  }
  return task;
}

export function storedTaskStatus(status: string): string {
  return status === "OVERDUE" ? "PENDING" : status;
}
