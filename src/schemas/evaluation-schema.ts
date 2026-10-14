import z from "./zod";

const CreateEvaluationSchema = z.object({
  title: z.string().min(1).max(150),
  weight: z.coerce.number().positive().optional(),
  score: z.coerce.number().min(0).max(10).optional(),
  date: z.coerce.date(),
  disciplineId: z.string().min(1),
});

const UpdateEvaluationSchema = CreateEvaluationSchema.omit({ disciplineId: true }).partial();
const EvaluationIdSchema = z.object({ id: z.string().min(1) });
const DisciplineIdSchema = z.object({ disciplineId: z.string().min(1) });

type CreateEvaluationSchemaType = z.infer<typeof CreateEvaluationSchema>;
type UpdateEvaluationSchemaType = z.infer<typeof UpdateEvaluationSchema>;
type EvaluationIdSchemaType = z.infer<typeof EvaluationIdSchema>;
type DisciplineIdSchemaType = z.infer<typeof DisciplineIdSchema>;

export {
  CreateEvaluationSchema,
  CreateEvaluationSchemaType,
  DisciplineIdSchema,
  DisciplineIdSchemaType,
  EvaluationIdSchema,
  EvaluationIdSchemaType,
  UpdateEvaluationSchema,
  UpdateEvaluationSchemaType,
};
