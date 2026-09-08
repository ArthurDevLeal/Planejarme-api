import { Request, Response } from "express";
import { BadRequestsException } from "../exceptions/bad-requests";
import { NotFoundException } from "../exceptions/not-found";
import { ErrorCode } from "../exceptions/root";
import {
  CreateDisciplineSchema,
  DisciplineIdSchema,
  UpdateDisciplineSchema,
  UserIdSchema,
} from "../schemas/discipline-schema";
import {
  CreateDisciplineService,
  DeleteDisciplineService,
  FindDisciplineByIdService,
  FindDisciplinesByUserService,
  UpdateDisciplineService,
} from "../services/discipline-service";
import { sendSuccess } from "../utils/api-response";
import { ErrorHandler } from "../utils/error-handler";

export class DisciplineController {
  GetDisciplineById = ErrorHandler(async (req: Request, res: Response) => {
    const result = DisciplineIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid discipline id", ErrorCode.INVALID_DATA);

    const discipline = await FindDisciplineByIdService(result.data.id);
    if (!discipline) throw new NotFoundException("Discipline not found", ErrorCode.INVALID_DATA);
    return sendSuccess(res, discipline);
  });

  GetDisciplinesByUser = ErrorHandler(async (req: Request, res: Response) => {
    const result = UserIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid user id", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await FindDisciplinesByUserService(result.data.userId));
  });

  CreateDiscipline = ErrorHandler(async (req: Request, res: Response) => {
    const result = CreateDisciplineSchema.safeParse(req.body);
    if (!result.success) throw new BadRequestsException("Invalid data", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await CreateDisciplineService(result.data), "Discipline created", 201);
  });

  UpdateDiscipline = ErrorHandler(async (req: Request, res: Response) => {
    const params = DisciplineIdSchema.safeParse(req.params);
    const body = UpdateDisciplineSchema.safeParse(req.body);
    if (!params.success || !body.success)
      throw new BadRequestsException("Invalid data", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await UpdateDisciplineService(params.data.id, body.data), "Discipline updated");
  });

  DeleteDiscipline = ErrorHandler(async (req: Request, res: Response) => {
    const result = DisciplineIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid discipline id", ErrorCode.INVALID_DATA);
    await DeleteDisciplineService(result.data.id);
    return sendSuccess(res, null, "Discipline deleted");
  });
}
