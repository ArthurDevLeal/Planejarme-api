import { Request, Response } from "express";
import { ValidationException } from "../exceptions/validation";
import { AttendanceDateSchema, SetAttendanceSchema } from "../schemas/attendance-schema";
import { ScheduleIdSchema } from "../schemas/schedule-schema";
import { SetAttendanceService } from "../services/attendance-service";
import { sendSuccess } from "../utils/api-response";
import { ErrorHandler } from "../utils/error-handler";

export class AttendanceController {
  SetAttendance = ErrorHandler(async (req: Request, res: Response) => {
    const params = ScheduleIdSchema.safeParse(req.params);
    const body = SetAttendanceSchema.safeParse(req.body);
    const date = req.params.date ? AttendanceDateSchema.safeParse(req.params) : null;
    if (!params.success || !body.success || (date && !date.success)) throw new ValidationException("Confira a aula, a data e a presença informadas.", params, body, ...(date ? [date] : []));
    return sendSuccess(res, await SetAttendanceService(req.userId, params.data.id, body.data.attended, date?.data.date));
  });
}
