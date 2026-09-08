import z from "zod";

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  dueDate: z.coerce.date(),
  priority: z.string().min(1).max(30).optional(),
  status: z.string().min(1).max(30).optional(),
  userId: z.string().min(1),
  disciplineId: z.string().min(1).optional(),
});

const UpdateTaskSchema = CreateTaskSchema.omit({ userId: true }).partial();
const TaskIdSchema = z.object({ id: z.string().min(1) });
const UserIdSchema = z.object({ userId: z.string().min(1) });
const TaskStatusSchema = z.object({ status: z.string().min(1).max(30) });

type CreateTaskSchemaType = z.infer<typeof CreateTaskSchema>;
type UpdateTaskSchemaType = z.infer<typeof UpdateTaskSchema>;
type TaskIdSchemaType = z.infer<typeof TaskIdSchema>;
type UserIdSchemaType = z.infer<typeof UserIdSchema>;
type TaskStatusSchemaType = z.infer<typeof TaskStatusSchema>;

export {
  CreateTaskSchema,
  CreateTaskSchemaType,
  TaskIdSchema,
  TaskIdSchemaType,
  TaskStatusSchema,
  TaskStatusSchemaType,
  UpdateTaskSchema,
  UpdateTaskSchemaType,
  UserIdSchema,
  UserIdSchemaType,
};
