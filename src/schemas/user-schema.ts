import z from "./zod.ts";

const optionalText = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.email(),
  password: z.string().min(6).max(255),
  phone: optionalText,
  course: optionalText,
  institution: optionalText,
  // Código de afiliado guardado no cookie `ref` do web; inválido ou bloqueado é ignorado em silêncio.
  ref: optionalText,
});

const FindUserByIdSchema = z.object({
  id: z.string(),
});

const UserIdSchema = z.object({
  userId: z.string(),
});

const FindUserByEmailSchema = z.object({
  email: z.email(),
});

const DeleteUserSchema = z.object({
  id: z.string(),
  password: z.string().min(1).max(255),
});

const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.email().optional(),
  password: z.string().min(6).max(255).optional(),
  phone: z.string().optional(),
  course: z.string().optional(),
  institution: z.string().optional(),
  passingScore: z.number().optional(),
  maxAbsencePct: z.number().optional(),
  defaultGradingSystem: z.enum(["ARITHMETIC", "WEIGHTED"]).optional(),
  roundingMode: z.enum(["NEAREST", "UP", "DOWN"]).optional(),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(6).max(255),
  newPassword: z.string().min(6).max(255),
});

type CreateUserSchemaType = z.infer<typeof CreateUserSchema>;
type FindUserByIdSchemaType = z.infer<typeof FindUserByIdSchema>;
type UserIdSchemaType = z.infer<typeof UserIdSchema>;
type DeleteUserSchemaType = z.infer<typeof DeleteUserSchema>;
type UpdateUserSchemaType = z.infer<typeof UpdateUserSchema>;
type FindUserByEmailSchemaType = z.infer<typeof FindUserByEmailSchema>;
type ChangePasswordSchemaType = z.infer<typeof ChangePasswordSchema>;

export {
  ChangePasswordSchema,
  ChangePasswordSchemaType,
  CreateUserSchema,
  CreateUserSchemaType,
  DeleteUserSchema,
  DeleteUserSchemaType,
  FindUserByEmailSchema,
  FindUserByEmailSchemaType,
  FindUserByIdSchema,
  FindUserByIdSchemaType,
  UpdateUserSchema,
  UpdateUserSchemaType,
  UserIdSchema,
  UserIdSchemaType,
};

const disciplineIncludes = ["schedules", "attendances", "evaluations", "materials"] as const;
export type DisciplineInclude = (typeof disciplineIncludes)[number];

export const ScreenDataQuerySchema = z.object({
  semesterId: z.string().min(1).optional(),
  include: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",") : []))
    .pipe(z.array(z.enum(disciplineIncludes))),
});
