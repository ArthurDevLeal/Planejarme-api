import { brasiliaDate } from "./academic-date.ts";

// RN11/RN13: "OVERDUE" é derivado na leitura, nunca gravado; assim a tarefa vira atrasada sem cron.
// "IN_PROGRESS" não vira "OVERDUE": é a coluna do quadro, e o atraso sai da data.
export function withTaskStatus<T extends { status: string; dueDate: Date }>(task: T, now = new Date()): T {
  if (task.status === "PENDING" && brasiliaDate(task.dueDate) < brasiliaDate(now)) {
    return { ...task, status: "OVERDUE" };
  }
  return task;
}

/** Cliente pode reenviar o status que leu; "OVERDUE" volta a ser "PENDING" no banco. */
export function storedTaskStatus(status: string): string {
  return status === "OVERDUE" ? "PENDING" : status;
}
