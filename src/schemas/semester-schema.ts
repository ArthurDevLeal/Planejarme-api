import z from "./zod";

const CreateSemesterSchema = z.object({
  name: z.string().min(1).max(50),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  isCurrent: z.boolean().optional(),
  userId: z.string().min(1),
});

const UpdateSemesterSchema = CreateSemesterSchema.omit({ userId: true }).partial();
const SemesterIdSchema = z.object({ id: z.string().min(1) });
const UserIdSchema = z.object({ userId: z.string().min(1) });

type CreateSemesterSchemaType = z.infer<typeof CreateSemesterSchema>;
type UpdateSemesterSchemaType = z.infer<typeof UpdateSemesterSchema>;
type SemesterIdSchemaType = z.infer<typeof SemesterIdSchema>;
type UserIdSchemaType = z.infer<typeof UserIdSchema>;

export {
  CreateSemesterSchema,
  CreateSemesterSchemaType,
  SemesterIdSchema,
  SemesterIdSchemaType,
  UpdateSemesterSchema,
  UpdateSemesterSchemaType,
  UserIdSchema,
  UserIdSchemaType,
};
