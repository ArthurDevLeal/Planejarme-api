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
  color: z.number().int().min(0).max(5).optional().nullable(),
  icon: z.string().regex(/^[a-z-]{1,40}$/).optional().nullable(),
  userId: z.string().min(1),
  semesterId: z.string().min(1).optional(),
  // Regra de aprovação; null volta a herdar o padrão do usuário.
  passingScore: z.number().min(0).max(10).optional().nullable(),
  maxAbsencePct: z.number().min(0).max(100).optional().nullable(),
  hasFinalExam: z.boolean().optional().nullable(),
  finalMinAverage: z.number().min(0).max(10).optional().nullable(),
  finalPassingScore: z.number().min(0).max(10).optional().nullable(),
  finalExamWeight: z.number().min(0.05).max(1).optional().nullable(),
});

/** Ter direito à final exige média menor que a de aprovação direta. */
const finalBelowPassing = (data: { passingScore?: number | null; finalMinAverage?: number | null }) =>
  data.finalMinAverage == null || data.passingScore == null || data.finalMinAverage < data.passingScore;
const finalBelowPassingError = {
  message: "A média mínima para a final precisa ser menor que a média de aprovação.",
  path: ["finalMinAverage"],
};

const CreateDisciplineSchema = BaseDisciplineSchema.extend({
  days: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  startTime: z.string().max(20).optional().nullable(),
  endTime: z.string().max(20).optional().nullable(),
  schedules: z.array(ScheduleInputSchema).optional(),
}).refine(
  (data) => data.absences === undefined || data.absences <= data.workloadHours,
  {
    message: "O número de faltas não pode ultrapassar a carga horária total.",
    path: ["absences"],
  }
).refine(finalBelowPassing, finalBelowPassingError);

const UpdateDisciplineSchema = BaseDisciplineSchema.omit({ userId: true })
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
  )
  .refine(finalBelowPassing, finalBelowPassingError);
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
