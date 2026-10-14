import { AuthorizeRequestService } from "../services/authorization-service.ts";
import { ValidationException } from "../exceptions/validation.ts";
import { Request, Response } from "express";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import {
  CreateDisciplineSchema,
  DisciplineIdSchema,
  UpdateDisciplineSchema,
  UserIdSchema,
} from "../schemas/discipline-schema.ts";
import {
  CreateDisciplineService,
  DeleteDisciplineService,
  FindDisciplineByIdService,
  FindDisciplinesByUserService,
  UpdateDisciplineService,
} from "../services/discipline-service.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

export class DisciplineController {
  GetDisciplineById = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "discipline", req.params, req.body);
    const result = DisciplineIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de disciplina é inválido. Confira o registro selecionado.", result);

    const discipline = await FindDisciplineByIdService(result.data.id);
    if (!discipline) throw new NotFoundException("Disciplina não encontrada. O registro pode ter sido removido. Atualize a página e tente novamente.", ErrorCode.DISCIPLINE_NOT_FOUND);
    return sendSuccess(res, discipline);
  });

  GetDisciplinesByUser = ErrorHandler(async (req: Request, res: Response) => {
    const targetUserId = req.params.userId === "me" ? req.userId : req.params.userId;
    await AuthorizeRequestService(req.userId, "discipline", { ...req.params, userId: targetUserId }, req.body);
    const result = UserIdSchema.safeParse({ userId: targetUserId });
    if (!result.success) throw new ValidationException("O identificador de usuário é inválido. Confira o registro selecionado.", result);
    return sendSuccess(res, await FindDisciplinesByUserService(result.data.userId));
  });

  CreateDiscipline = ErrorHandler(async (req: Request, res: Response) => {
    const rawUserId = req.body?.userId === "me" || !req.body?.userId ? req.userId : req.body.userId;
    const body = { ...req.body, userId: rawUserId };
    await AuthorizeRequestService(req.userId, "discipline", req.params, body);
    const result = CreateDisciplineSchema.safeParse(body);
    if (!result.success) throw new ValidationException("Os dados enviados são inválidos. Confira os campos indicados e tente novamente.", result);
    return sendSuccess(res, await CreateDisciplineService(result.data), "Discipline created", 201);
  });

  UpdateDiscipline = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "discipline", req.params, req.body);
    const params = DisciplineIdSchema.safeParse(req.params);
    const body = UpdateDisciplineSchema.safeParse(req.body);
    if (!params.success || !body.success)
      throw new ValidationException("Os dados enviados são inválidos. Confira os campos indicados e tente novamente.", params, body);
    return sendSuccess(res, await UpdateDisciplineService(params.data.id, body.data), "Discipline updated");
  });

  DeleteDiscipline = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "discipline", req.params, req.body);
    const result = DisciplineIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de disciplina é inválido. Confira o registro selecionado.", result);
    await DeleteDisciplineService(result.data.id);
    return sendSuccess(res, null, "Discipline deleted");
  });
}
