import z from "zod";

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.email(),
  password: z.string().min(6).max(255),
  phone: z.string().optional(),
  course: z.string().optional(),
  institution: z.string().optional(),
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
});

type CreateUserSchemaType = z.infer<typeof CreateUserSchema>;
type FindUserByIdSchemaType = z.infer<typeof FindUserByIdSchema>;
type UserIdSchemaType = z.infer<typeof UserIdSchema>;
type DeleteUserSchemaType = z.infer<typeof DeleteUserSchema>;
type UpdateUserSchemaType = z.infer<typeof UpdateUserSchema>;
type FindUserByEmailSchemaType = z.infer<typeof FindUserByEmailSchema>;
export {
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
