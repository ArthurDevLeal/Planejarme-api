import z from "./zod.ts";

const CreateMaterialSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.string().min(1).max(50),
  url: z.string().optional().default(""),
  fileSizeMb: z.coerce.number().nonnegative().optional(),
  mimeType: z.string().optional(),
  disciplineId: z.string().min(1).optional().nullable(),
  taskId: z.string().min(1).optional().nullable(),
  folderId: z.string().min(1).optional().nullable(),
});

const UpdateMaterialSchema = CreateMaterialSchema.partial();
const UploadUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
  sizeBytes: z.coerce.number().int().nonnegative(),
});
const FinalizeUploadSchema = z.object({
  path: z.string().min(1).max(500),
  fileName: z.string().max(255).optional(),
  title: z.string().max(200).optional(),
  disciplineId: z.string().min(1).optional().nullable(),
  taskId: z.string().min(1).optional().nullable(),
  folderId: z.string().min(1).optional().nullable(),
});
const MaterialIdSchema = z.object({ id: z.string().min(1) });
const DisciplineIdSchema = z.object({ disciplineId: z.string().min(1) });
const TaskIdSchema = z.object({ taskId: z.string().min(1) });
const GetMaterialsQuerySchema = z.object({
  semesterId: z.string().min(1).optional(),
});

type CreateMaterialSchemaType = z.infer<typeof CreateMaterialSchema>;
type UpdateMaterialSchemaType = z.infer<typeof UpdateMaterialSchema>;
type UploadUrlSchemaType = z.infer<typeof UploadUrlSchema>;
type FinalizeUploadSchemaType = z.infer<typeof FinalizeUploadSchema>;
type MaterialIdSchemaType = z.infer<typeof MaterialIdSchema>;
type DisciplineIdSchemaType = z.infer<typeof DisciplineIdSchema>;
type GetMaterialsQuerySchemaType = z.infer<typeof GetMaterialsQuerySchema>;

export {
  CreateMaterialSchema,
  CreateMaterialSchemaType,
  DisciplineIdSchema,
  DisciplineIdSchemaType,
  FinalizeUploadSchema,
  FinalizeUploadSchemaType,
  GetMaterialsQuerySchema,
  GetMaterialsQuerySchemaType,
  MaterialIdSchema,
  MaterialIdSchemaType,
  TaskIdSchema,
  UpdateMaterialSchema,
  UpdateMaterialSchemaType,
  UploadUrlSchema,
  UploadUrlSchemaType,
};
