import z from "./zod.ts";

const ScheduleInputSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().max(20).optional().nullable(),
  endTime: z.string().max(20).optional().nullable(),
});

const BaseDisciplineSchema = z.object({
  name: z.string().min(1).max(150),
  professor: z.string().max(150).optional(),
  classroom: z.string().max(100).optional(),
  workloadHours: z.coerce.number().int().positive(),
  absences: z.coerce.number().int().nonnegative().optional(),
  gradingSystem: z.string().min(1).max(50).optional(),
  userId: z.string().min(1),
  semesterId: z.string().min(1).optional(),
  days: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  startTime: z.string().max(20).optional().nullable(),
  endTime: z.string().max(20).optional().nullable(),
  schedules: z.array(ScheduleInputSchema).optional(),
});

const CreateDisciplineSchema = BaseDisciplineSchema.refine(
  (data) => data.absences === undefined || data.absences <= data.workloadHours,
  {
    message: "O número de faltas não pode ultrapassar a carga horária total.",
    path: ["absences"],
  }
);

const UpdateDisciplineSchema = BaseDisciplineSchema.omit({ userId: true, days: true })
  .partial()
  .refine(
    (data) =>
      data.absences === undefined ||
      data.workloadHours === undefined ||
      data.absences <= data.workloadHours,
    {
      message: "O número de faltas não pode ultrapassar a carga horária total.",
      path: ["absences"],
    }
  );
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
