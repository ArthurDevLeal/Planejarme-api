import z from "./zod.ts";

const CreateInboxItemSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().min(1),
  type: z.string().min(1).max(50),
  fileUrl: z.url().optional(),
  userId: z.string().min(1),
});

const UpdateInboxItemSchema = CreateInboxItemSchema.omit({ userId: true }).partial();
const InboxItemIdSchema = z.object({ id: z.string().min(1) });
const UserIdSchema = z.object({ userId: z.string().min(1) });

type CreateInboxItemSchemaType = z.infer<typeof CreateInboxItemSchema>;
type UpdateInboxItemSchemaType = z.infer<typeof UpdateInboxItemSchema>;
type InboxItemIdSchemaType = z.infer<typeof InboxItemIdSchema>;
type UserIdSchemaType = z.infer<typeof UserIdSchema>;

export {
  CreateInboxItemSchema,
  CreateInboxItemSchemaType,
  InboxItemIdSchema,
  InboxItemIdSchemaType,
  UpdateInboxItemSchema,
  UpdateInboxItemSchemaType,
  UserIdSchema,
  UserIdSchemaType,
};
