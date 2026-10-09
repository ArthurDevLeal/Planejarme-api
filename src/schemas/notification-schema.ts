import z from "./zod";

const CreateNotificationSchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1),
  type: z.string().min(1).max(50),
  userId: z.string().min(1),
});

const UpdateNotificationSchema = CreateNotificationSchema.omit({ userId: true }).partial();
const NotificationIdSchema = z.object({ id: z.string().min(1) });
const UserIdSchema = z.object({ userId: z.string().min(1) });

type CreateNotificationSchemaType = z.infer<typeof CreateNotificationSchema>;
type UpdateNotificationSchemaType = z.infer<typeof UpdateNotificationSchema>;
type NotificationIdSchemaType = z.infer<typeof NotificationIdSchema>;
type UserIdSchemaType = z.infer<typeof UserIdSchema>;

export {
  CreateNotificationSchema,
  CreateNotificationSchemaType,
  NotificationIdSchema,
  NotificationIdSchemaType,
  UpdateNotificationSchema,
  UpdateNotificationSchemaType,
  UserIdSchema,
  UserIdSchemaType,
};
