import z from "zod";

const SignInSchema = z.object({
  email: z.email(),
  password: z.string().min(6).max(255),
});

type SignInSchemaType = z.infer<typeof SignInSchema>;

export { SignInSchema, SignInSchemaType };
