import z from "./zod.ts";

const ReviewsQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(14).default(1) });
const ReviewCheckParamsSchema = z.object({
  evaluationId: z.string().min(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const ReviewCheckBodySchema = z.object({ done: z.boolean() });

export { ReviewCheckBodySchema, ReviewCheckParamsSchema, ReviewsQuerySchema };
