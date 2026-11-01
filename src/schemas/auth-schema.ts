import z from "./zod.ts";

const SignInSchema = z.object({
  email: z.email(),
  password: z.string().min(6).max(255),
});

const ForgotPasswordSchema = z.object({
  email: z.email(),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(6).max(255),
});

type SignInSchemaType = z.infer<typeof SignInSchema>;

export { ForgotPasswordSchema, ResetPasswordSchema, SignInSchema, SignInSchemaType };
