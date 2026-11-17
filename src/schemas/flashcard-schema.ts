import z from "./zod.ts";

const CreateDeckSchema = z.object({
  disciplineId: z.string().min(1),
  materialIds: z.array(z.string().min(1)).min(1).max(30).optional(),
  count: z.literal([10, 20, 30]),
});
const IdSchema = z.object({ id: z.string().min(1) });
const ListDecksSchema = z.object({ disciplineId: z.string().min(1).optional() });
const ReviewSchema = z.object({ grade: z.enum(["again", "hard", "good", "easy"]) });

type CreateDeckSchemaType = z.infer<typeof CreateDeckSchema>;
type Grade = z.infer<typeof ReviewSchema>["grade"];

export { CreateDeckSchema, CreateDeckSchemaType, Grade, IdSchema, ListDecksSchema, ReviewSchema };
