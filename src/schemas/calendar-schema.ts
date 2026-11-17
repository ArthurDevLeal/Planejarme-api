import z from "./zod.ts";

const CalendarFileParamsSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/) });

export { CalendarFileParamsSchema };
