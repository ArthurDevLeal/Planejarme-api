import z from "zod";

const CreateScheduleSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().min(1).max(20),
  endTime: z.string().min(1).max(20),
  disciplineId: z.string().min(1),
});

const UpdateScheduleSchema = CreateScheduleSchema.omit({ disciplineId: true }).partial();
const ScheduleIdSchema = z.object({ id: z.string().min(1) });
const DisciplineIdSchema = z.object({ disciplineId: z.string().min(1) });

type CreateScheduleSchemaType = z.infer<typeof CreateScheduleSchema>;
type UpdateScheduleSchemaType = z.infer<typeof UpdateScheduleSchema>;
type ScheduleIdSchemaType = z.infer<typeof ScheduleIdSchema>;
type DisciplineIdSchemaType = z.infer<typeof DisciplineIdSchema>;

export {
  CreateScheduleSchema,
  CreateScheduleSchemaType,
  DisciplineIdSchema,
  DisciplineIdSchemaType,
  ScheduleIdSchema,
  ScheduleIdSchemaType,
  UpdateScheduleSchema,
  UpdateScheduleSchemaType,
};
