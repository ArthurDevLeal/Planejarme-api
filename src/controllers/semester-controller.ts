import { Request, Response } from "express";
import { AuthorizeRequestService } from "../services/authorization-service";
import { ValidationException } from "../exceptions/validation";
import { NotFoundException } from "../exceptions/not-found";
import { ErrorCode } from "../exceptions/root";
import {
  CreateSemesterSchema,
  SemesterIdSchema,
  UpdateSemesterSchema,
  UserIdSchema,
} from "../schemas/semester-schema";
import {
  CreateSemesterService,
  DeleteSemesterService,
  FindSemesterByIdService,
  FindSemestersByUserService,
  SetCurrentSemesterService,
  UpdateSemesterService,
} from "../services/semester-service";
import { sendSuccess } from "../utils/api-response";
import { ErrorHandler } from "../utils/error-handler";

export class SemesterController {
  GetSemestersByUser = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "semester", req.params, req.body);
    const result = UserIdSchema.safeParse(req.params);
    if (!result.success) {
      throw new ValidationException(
        "O identificador de usuário é inválido. Confira o registro selecionado.",
        result,
      );
    }
    return sendSuccess(res, await FindSemestersByUserService(result.data.userId));
  });

  GetSemesterById = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "semester", req.params, req.body);
    const result = SemesterIdSchema.safeParse(req.params);
    if (!result.success) {
      throw new ValidationException(
        "O identificador de semestre é inválido. Confira o registro selecionado.",
        result,
      );
    }
    const semester = await FindSemesterByIdService(result.data.id);
    if (!semester) {
      throw new NotFoundException(
        "Semestre não encontrado. O registro pode ter sido removido.",
        ErrorCode.SEMESTER_NOT_FOUND,
      );
    }
    return sendSuccess(res, semester);
  });

  CreateSemester = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "semester", req.params, req.body);
    const result = CreateSemesterSchema.safeParse(req.body);
    if (!result.success) {
      throw new ValidationException(
        "Os dados enviados são inválidos. Confira os campos indicados e tente novamente.",
        result,
      );
    }
    return sendSuccess(res, await CreateSemesterService(result.data), "Semester created", 201);
  });

  UpdateSemester = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "semester", req.params, req.body);
    const params = SemesterIdSchema.safeParse(req.params);
    const body = UpdateSemesterSchema.safeParse(req.body);
    if (!params.success || !body.success) {
      throw new ValidationException(
        "Os dados enviados são inválidos. Confira os campos indicados e tente novamente.",
        params,
        body,
      );
    }
    return sendSuccess(res, await UpdateSemesterService(params.data.id, body.data), "Semester updated");
  });

  SetCurrentSemester = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "semester", req.params, req.body);
    const params = SemesterIdSchema.safeParse(req.params);
    if (!params.success) {
      throw new ValidationException(
        "O identificador de semestre é inválido.",
        params,
      );
    }
    return sendSuccess(res, await SetCurrentSemesterService(req.userId, params.data.id), "Active semester updated");
  });

  DeleteSemester = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "semester", req.params, req.body);
    const result = SemesterIdSchema.safeParse(req.params);
    if (!result.success) {
      throw new ValidationException(
        "O identificador de semestre é inválido.",
        result,
      );
    }
    await DeleteSemesterService(result.data.id);
    return sendSuccess(res, null, "Semester deleted");
  });
}
