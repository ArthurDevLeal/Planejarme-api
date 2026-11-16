import z from "./zod.ts";

const CreateQuizSchema = z.object({
  disciplineId: z.string().min(1),
  evaluationId: z.string().min(1).optional(),
  materialIds: z.array(z.string().min(1)).min(1).max(30).optional(),
  count: z.literal([10, 15, 20]),
  // Só muda o pedido ao modelo; não é guardado no Quiz.
  level: z.enum(["BASIC", "MEDIUM", "ADVANCED"]).default("MEDIUM"),
});

const QuizIdSchema = z.object({ id: z.string().min(1) });
const ListQuizzesSchema = z.object({ disciplineId: z.string().min(1).optional() });
const SubmitQuizAnswersSchema = z.object({
  answers: z.array(z.object({ questionId: z.string().min(1), chosenIndex: z.number().int().min(0).max(3) })).max(50),
});

type CreateQuizSchemaType = z.infer<typeof CreateQuizSchema>;
type SubmitQuizAnswersSchemaType = z.infer<typeof SubmitQuizAnswersSchema>;

export { CreateQuizSchema, CreateQuizSchemaType, ListQuizzesSchema, QuizIdSchema, SubmitQuizAnswersSchema, SubmitQuizAnswersSchemaType };
