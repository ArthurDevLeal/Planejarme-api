import z from "./zod";
export const SetAttendanceSchema = z.object({ attended: z.boolean() });
export const AttendanceDateSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
