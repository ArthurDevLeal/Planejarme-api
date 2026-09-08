import { prisma } from "../../lib/prisma";
import { CreateInboxItemSchemaType, UpdateInboxItemSchemaType } from "../schemas/inbox-item-schema";

export function CreateInboxItemService(data: CreateInboxItemSchemaType) {
  return prisma.inboxItem.create({ data });
}

export function FindInboxItemByIdService(id: string) {
  return prisma.inboxItem.findUnique({ where: { id } });
}

export function FindInboxItemsByUserService(userId: string) {
  return prisma.inboxItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export function UpdateInboxItemService(id: string, data: UpdateInboxItemSchemaType) {
  return prisma.inboxItem.update({ where: { id }, data });
}

export function DeleteInboxItemService(id: string) {
  return prisma.inboxItem.delete({ where: { id } });
}
