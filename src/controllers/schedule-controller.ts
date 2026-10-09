import { ValidationException } from "../exceptions/validation";
import { Request, Response } from "express";
import { NotFoundException } from "../exceptions/not-found";
import { ErrorCode } from "../exceptions/root";
import {
  CreateScheduleSchema,
  DisciplineIdSchema,
  ScheduleIdSchema,
  UpdateScheduleSchema,
} from "../schemas/schedule-schema";
import { UserIdSchema } from "../schemas/user-schema";
import {
  CreateScheduleService,
  DeleteScheduleService,
  FindScheduleByIdService,
  FindSchedulesByDisciplineService,
  FindSchedulesByUserService,
  UpdateScheduleService,
} from "../services/schedule-service";
import { sendSuccess } from "../utils/api-response";
import { ErrorHandler } from "../utils/error-handler";

export class ScheduleController {
  GetSchedulesByUser = ErrorHandler(async (req: Request, res: Response) => {
    const result = UserIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de usuário é inválido. Confira o registro selecionado.", result);
    return sendSuccess(res, await FindSchedulesByUserService(result.data.userId));
  });

  GetScheduleById = ErrorHandler(async (req: Request, res: Response) => {
    const result = ScheduleIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de horário é inválido. Confira o registro selecionado.", result);
    const schedule = await FindScheduleByIdService(result.data.id);
    if (!schedule) throw new NotFoundException("Horário não encontrado. O registro pode ter sido removido. Atualize a página e tente novamente.", ErrorCode.SCHEDULE_NOT_FOUND);
    return sendSuccess(res, schedule);
  });

  GetSchedulesByDiscipline = ErrorHandler(async (req: Request, res: Response) => {
    const result = DisciplineIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de disciplina é inválido. Confira o registro selecionado.", result);
    return sendSuccess(res, await FindSchedulesByDisciplineService(result.data.disciplineId));
  });

  CreateSchedule = ErrorHandler(async (req: Request, res: Response) => {
    const result = CreateScheduleSchema.safeParse(req.body);
    if (!result.success) throw new ValidationException("Os dados enviados são inválidos. Confira os campos indicados e tente novamente.", result);
    return sendSuccess(res, await CreateScheduleService(result.data), "Schedule created", 201);
  });

  UpdateSchedule = ErrorHandler(async (req: Request, res: Response) => {
    const params = ScheduleIdSchema.safeParse(req.params);
    const body = UpdateScheduleSchema.safeParse(req.body);
    if (!params.success || !body.success)
      throw new ValidationException("Os dados enviados são inválidos. Confira os campos indicados e tente novamente.", params, body);
    return sendSuccess(res, await UpdateScheduleService(params.data.id, body.data), "Schedule updated");
  });

  DeleteSchedule = ErrorHandler(async (req: Request, res: Response) => {
    const result = ScheduleIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de horário é inválido. Confira o registro selecionado.", result);
    await DeleteScheduleService(result.data.id);
    return sendSuccess(res, null, "Schedule deleted");
  });
}
