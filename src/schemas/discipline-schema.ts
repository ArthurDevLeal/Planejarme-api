import z from "./zod";

const CreateDisciplineSchema = z.object({
  name: z.string().min(1).max(150),
  professor: z.string().max(150).optional(),
  classroom: z.string().max(100).optional(),
  workloadHours: z.coerce.number().int().positive(),
  absences: z.coerce.number().int().nonnegative().optional(),
  gradingSystem: z.string().min(1).max(50).optional(),
  userId: z.string().min(1),
});

const UpdateDisciplineSchema = CreateDisciplineSchema.omit({ userId: true }).partial();
const DisciplineIdSchema = z.object({ id: z.string().min(1) });
const UserIdSchema = z.object({ userId: z.string().min(1) });

type CreateDisciplineSchemaType = z.infer<typeof CreateDisciplineSchema>;
type UpdateDisciplineSchemaType = z.infer<typeof UpdateDisciplineSchema>;
type DisciplineIdSchemaType = z.infer<typeof DisciplineIdSchema>;
type UserIdSchemaType = z.infer<typeof UserIdSchema>;

export {
  CreateDisciplineSchema,
  CreateDisciplineSchemaType,
  DisciplineIdSchema,
  DisciplineIdSchemaType,
  UpdateDisciplineSchema,
  UpdateDisciplineSchemaType,
  UserIdSchema,
  UserIdSchemaType,
};
