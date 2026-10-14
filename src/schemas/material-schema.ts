import z from "./zod.ts";

const CreateMaterialSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.string().min(1).max(50),
  url: z.string().optional().default(""),
  fileSizeMb: z.coerce.number().nonnegative().optional(),
  mimeType: z.string().optional(),
  storagePath: z.string().optional(),
  disciplineId: z.string().min(1).optional().nullable(),
  userId: z.string().min(1).optional(),
});

const UpdateMaterialSchema = CreateMaterialSchema.partial();
const MaterialIdSchema = z.object({ id: z.string().min(1) });
const DisciplineIdSchema = z.object({ disciplineId: z.string().min(1) });
const GetMaterialsQuerySchema = z.object({
  semesterId: z.string().min(1).optional(),
});

type CreateMaterialSchemaType = z.infer<typeof CreateMaterialSchema>;
type UpdateMaterialSchemaType = z.infer<typeof UpdateMaterialSchema>;
type MaterialIdSchemaType = z.infer<typeof MaterialIdSchema>;
type DisciplineIdSchemaType = z.infer<typeof DisciplineIdSchema>;
type GetMaterialsQuerySchemaType = z.infer<typeof GetMaterialsQuerySchema>;

export {
  CreateMaterialSchema,
  CreateMaterialSchemaType,
  DisciplineIdSchema,
  DisciplineIdSchemaType,
  GetMaterialsQuerySchema,
  GetMaterialsQuerySchemaType,
  MaterialIdSchema,
  MaterialIdSchemaType,
  UpdateMaterialSchema,
  UpdateMaterialSchemaType,
};
