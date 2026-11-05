import z from "./zod.ts";

const ShareTargetSchema = z.object({
  kind: z.enum(["material", "folder", "discipline"]),
  id: z.string().min(1),
});

const UpsertShareLinkSchema = z.object({
  target: ShareTargetSchema,
  expiresIn: z.enum(["1h", "1d", "7d", "30d"]),
});

const CreateShareInviteSchema = z.object({
  target: ShareTargetSchema,
  email: z.email().trim().toLowerCase(),
});

const ShareIdSchema = z.object({ id: z.string().min(1) });
const ShareTokenSchema = z.object({ token: z.string().min(16).max(64) });
const ShareContentQuerySchema = z.object({ folderId: z.string().min(1).optional() });
const ShareFileParamsSchema = z.object({ materialId: z.string().min(1) });

type ShareTarget = z.infer<typeof ShareTargetSchema>;
type ShareExpiry = z.infer<typeof UpsertShareLinkSchema>["expiresIn"];

export {
  CreateShareInviteSchema,
  ShareContentQuerySchema,
  ShareExpiry,
  ShareFileParamsSchema,
  ShareIdSchema,
  ShareTarget,
  ShareTokenSchema,
  UpsertShareLinkSchema,
};
