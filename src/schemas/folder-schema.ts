import z from "./zod.ts";

const name = z.string().trim().min(1).max(120);

const FolderIdSchema = z.object({ id: z.string().min(1) });
const CreateFolderSchema = z.object({
  name,
  parentId: z.string().min(1).optional().nullable(),
  disciplineId: z.string().min(1).optional().nullable(),
});
const RenameFolderSchema = z.object({ name });
const MoveFolderSchema = z.object({
  parentId: z.string().min(1).nullable(),
  disciplineId: z.string().min(1).nullable(),
});

type CreateFolderSchemaType = z.infer<typeof CreateFolderSchema>;
type MoveFolderSchemaType = z.infer<typeof MoveFolderSchema>;

export { CreateFolderSchema, CreateFolderSchemaType, FolderIdSchema, MoveFolderSchema, MoveFolderSchemaType, RenameFolderSchema };
