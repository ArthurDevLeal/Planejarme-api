import z from "./zod.ts";

const TrashItemSchema = z.object({
  kind: z.enum(["task", "material"]),
  id: z.string().min(1),
});

type TrashItemSchemaType = z.infer<typeof TrashItemSchema>;

export { TrashItemSchema, TrashItemSchemaType };
