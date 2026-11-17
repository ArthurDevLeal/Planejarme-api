import { prisma } from "../../lib/prisma.ts";
import { CreateNotificationSchemaType, UpdateNotificationSchemaType } from "../schemas/notification-schema.ts";

export function CreateNotificationService(data: CreateNotificationSchemaType) {
  return prisma.notification.create({ data });
}

/** Notificações-marca usadas só para deduplicar e-mails; ficam fora das listas. */
export const MARKER_TYPES = ["RISK_DIGEST", "LIFECYCLE_EMAIL"] as const;

export function FindNotificationByIdService(id: string) {
  return prisma.notification.findUnique({ where: { id } });
}

export function FindNotificationsByUserService(userId: string) {
  return prisma.notification.findMany({
    // Marcas de e-mail enviado (resumo de risco, ciclo de vida) não aparecem no sino.
    where: { userId, type: { notIn: [...MARKER_TYPES] } },
    orderBy: { createdAt: "desc" },
  });
}

export function FindUnreadNotificationsByUserService(userId: string) {
  return prisma.notification.findMany({
    where: { userId, read: false },
    orderBy: { createdAt: "desc" },
  });
}

export function UpdateNotificationService(id: string, data: UpdateNotificationSchemaType) {
  return prisma.notification.update({ where: { id }, data });
}

export function MarkNotificationAsReadService(id: string) {
  return prisma.notification.update({ where: { id }, data: { read: true } });
}

export function MarkAllNotificationsAsReadService(userId: string) {
  return prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
}

export function DeleteNotificationService(id: string) {
  return prisma.notification.delete({ where: { id } });
}
