import z from "./zod.ts";

const semesterDates = {
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
};

const CreateSemesterSchema = z
  .object({
    name: z.string().min(1).max(50),
    ...semesterDates,
    isCurrent: z.boolean().optional(),
    userId: z.string().min(1),
  })
  .refine((data) => data.endDate.getTime() >= data.startDate.getTime(), {
    message: "A data de término não pode ser anterior à data de início.",
    path: ["endDate"],
  });

const UpdateSemesterSchema = z
  .object({
    name: z.string().min(1).max(50).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    isCurrent: z.boolean().optional(),
  })
  .refine(
    (data) =>
      !data.startDate ||
      !data.endDate ||
      data.endDate.getTime() >= data.startDate.getTime(),
    {
      message: "A data de término não pode ser anterior à data de início.",
      path: ["endDate"],
    },
  );

const CopyDisciplinesSchema = z.object({
  targetSemesterId: z.string().min(1),
  /** Ausente copia todas as disciplinas do semestre de origem. */
  disciplineIds: z
    .array(z.string().min(1))
    .min(1, "Selecione ao menos uma disciplina para copiar.")
    .optional(),
  copySchedules: z.boolean().optional().default(false),
});

const SemesterIdSchema = z.object({ id: z.string().min(1) });
const UserIdSchema = z.object({ userId: z.string().min(1) });

type CreateSemesterSchemaType = z.infer<typeof CreateSemesterSchema>;
type UpdateSemesterSchemaType = z.infer<typeof UpdateSemesterSchema>;
type CopyDisciplinesSchemaType = z.infer<typeof CopyDisciplinesSchema>;
type SemesterIdSchemaType = z.infer<typeof SemesterIdSchema>;
type UserIdSchemaType = z.infer<typeof UserIdSchema>;

export {
  CopyDisciplinesSchema,
  CopyDisciplinesSchemaType,
  CreateSemesterSchema,
  CreateSemesterSchemaType,
  SemesterIdSchema,
  SemesterIdSchemaType,
  UpdateSemesterSchema,
  UpdateSemesterSchemaType,
  UserIdSchema,
  UserIdSchemaType,
};
