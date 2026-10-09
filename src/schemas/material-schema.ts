import z from "./zod";

const CreateMaterialSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.string().min(1).max(50),
  url: z.url(),
  fileSizeMb: z.coerce.number().nonnegative().optional(),
  disciplineId: z.string().min(1).optional(),
});

const UpdateMaterialSchema = CreateMaterialSchema.partial();
const MaterialIdSchema = z.object({ id: z.string().min(1) });
const DisciplineIdSchema = z.object({ disciplineId: z.string().min(1) });

type CreateMaterialSchemaType = z.infer<typeof CreateMaterialSchema>;
type UpdateMaterialSchemaType = z.infer<typeof UpdateMaterialSchema>;
type MaterialIdSchemaType = z.infer<typeof MaterialIdSchema>;
type DisciplineIdSchemaType = z.infer<typeof DisciplineIdSchema>;

export {
  CreateMaterialSchema,
  CreateMaterialSchemaType,
  DisciplineIdSchema,
  DisciplineIdSchemaType,
  MaterialIdSchema,
  MaterialIdSchemaType,
  UpdateMaterialSchema,
  UpdateMaterialSchemaType,
};
