import { prisma } from "../../lib/prisma.ts";
import { CreateNotificationSchemaType, UpdateNotificationSchemaType } from "../schemas/notification-schema.ts";

export function CreateNotificationService(data: CreateNotificationSchemaType) {
  return prisma.notification.create({ data });
}

export function FindNotificationByIdService(id: string) {
  return prisma.notification.findUnique({ where: { id } });
}

export function FindNotificationsByUserService(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
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

export function DeleteNotificationService(id: string) {
  return prisma.notification.delete({ where: { id } });
}
