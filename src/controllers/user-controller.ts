import { AuthorizeRequestService } from "../services/authorization-service.ts";
import { ValidationException } from "../exceptions/validation.ts";
import { Request, Response } from "express";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { UserAlreadyExistsException } from "../exceptions/user-already-exists.ts";
import {
  ChangePasswordSchema,
  CreateUserSchema,
  DeleteUserSchema,
  FindUserByIdSchema,
  ScreenDataQuerySchema,
  UpdateUserSchema,
  UserIdSchema,
} from "../schemas/user-schema.ts";
import { CreateUserService } from "../services/user/create-user.ts";
import { DeleteUserService } from "../services/user/delete-user.ts";
import { ExportUserDataService } from "../services/user/export-user-data.ts";
import { FindUserByIdService } from "../services/user/find-user-by-id.ts";
import {
  GetUserContextService,
  GetUserDashboardService,
  GetUserDisciplinesService,
  GetUserTasksService,
} from "../services/user/get-user-dashboard.ts";
import { ChangePasswordService } from "../services/user/change-password.ts";
import { UpdateUserService } from "../services/user/update-user.ts";
import { GetUsageService } from "../services/plan-service.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

// Senha, vínculo com a Abacate Pay, quem indicou e motivo de bloqueio nunca saem nas respostas de usuário.
function withoutPasswordHash<T extends { passwordHash: string }>(row: T) {
  const { passwordHash: _, abacateCustomerId: _c, abacateSubscriptionId: _s, referredById: _r, affiliateBlockReason: _b, affiliateBlockedAt: _a, ...user } = row as T & Record<string, unknown>;
  return user;
}

function screenQuery(req: Request) {
  const result = ScreenDataQuerySchema.safeParse(req.query);
  if (!result.success) throw new ValidationException("Os filtros enviados são inválidos. Atualize a página e tente novamente.", result);
  return result.data;
}

export class UserController {
  GetCurrentUserContext = ErrorHandler(async (req: Request, res: Response) => {
    const context = await GetUserContextService(req.userId);
    if (!context) throw new NotFoundException("Usuário não encontrado.", ErrorCode.USER_NOT_FOUND);
    return sendSuccess(res, context);
  });
  GetCurrentUserDisciplines = ErrorHandler(async (req: Request, res: Response) => {
    const { semesterId, include } = screenQuery(req);
    return sendSuccess(res, await GetUserDisciplinesService(req.userId, semesterId, include));
  });
  GetCurrentUserUsage = ErrorHandler(async (req: Request, res: Response) => {
    return sendSuccess(res, await GetUsageService(req.userId));
  });
  GetCurrentUserTasks = ErrorHandler(async (req: Request, res: Response) => {
    return sendSuccess(res, await GetUserTasksService(req.userId, screenQuery(req).semesterId));
  });
  GetCurrentUserDashboard = ErrorHandler(async (req: Request, res: Response) => {
    const semesterId = typeof req.query.semesterId === "string" ? req.query.semesterId : undefined;
    const dashboard = await GetUserDashboardService(req.userId, semesterId);
    if (!dashboard) throw new NotFoundException("Usuário não encontrado.", ErrorCode.USER_NOT_FOUND);
    return sendSuccess(res, dashboard);
  });
  GetUserDashboard = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "user", req.params, req.body);
    const result = UserIdSchema.safeParse(req.params);
    if (!result.success) {
      throw new ValidationException("O identificador de usuário é inválido. Confira o registro selecionado.", result);
    }

    const semesterId = typeof req.query.semesterId === "string" ? req.query.semesterId : undefined;
    const dashboard = await GetUserDashboardService(result.data.userId, semesterId);
    if (!dashboard) {
      throw new NotFoundException("Usuário não encontrado. O registro pode ter sido removido. Atualize a página e tente novamente.", ErrorCode.USER_NOT_FOUND);
    }

    return sendSuccess(res, dashboard);
  });

  GetUserById = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "user", req.params, req.body);
    const result = FindUserByIdSchema.safeParse(req.params);
    if (!result.success) {
      throw new ValidationException("O identificador de usuário é inválido. Confira o registro selecionado.", result);
    }

    const targetId = result.data.id === "me" ? req.userId : result.data.id;
    const user = await FindUserByIdService({ id: targetId });
    if (!user) {
      throw new NotFoundException("Usuário não encontrado. O registro pode ter sido removido. Atualize a página e tente novamente.", ErrorCode.USER_NOT_FOUND);
    }

    return sendSuccess(res, withoutPasswordHash(user));
  });

  CreateUser = ErrorHandler(async (req: Request, res: Response) => {
    const result = CreateUserSchema.safeParse(req.body);
    if (!result.success) {
      throw new ValidationException("Os dados enviados são inválidos. Confira os campos indicados e tente novamente.", result);
    }

    let user;
    try {
      user = await CreateUserService(result.data);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        throw new UserAlreadyExistsException();
      }

      throw error;
    }

    return sendSuccess(res, withoutPasswordHash(user), "User created", 201);
  });

  UpdateUser = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "user", req.params, req.body);
    const params = FindUserByIdSchema.safeParse(req.params);
    const body = UpdateUserSchema.safeParse(req.body);
    if (!params.success || !body.success) {
      throw new ValidationException("Os dados enviados são inválidos. Confira os campos indicados e tente novamente.", params, body);
    }

    const targetId = params.data.id === "me" ? req.userId : params.data.id;
    const user = await UpdateUserService(targetId, body.data);
    return sendSuccess(res, withoutPasswordHash(user), "User updated");
  });

  UpdatePassword = ErrorHandler(async (req: Request, res: Response) => {
    const body = ChangePasswordSchema.safeParse(req.body);
    if (!body.success) {
      throw new ValidationException(
        "Os dados enviados são inválidos. Confira os campos indicados e tente novamente.",
        body,
      );
    }

    await ChangePasswordService(req.userId, body.data.currentPassword, body.data.newPassword);
    return sendSuccess(res, null, "Password updated");
  });

  DeleteUser = ErrorHandler(async (req: Request, res: Response) => {    await AuthorizeRequestService(req.userId, "user", req.params, req.body);
    const result = DeleteUserSchema.safeParse({ ...req.body, id: req.params.id });
    if (!result.success) {
      throw new ValidationException("Confirme a exclusão digitando sua senha.", result);
    }

    await DeleteUserService(result.data.id === "me" ? req.userId : result.data.id, result.data.password);
    return sendSuccess(res, null, "User deleted");
  });

  ExportCurrentUserData = ErrorHandler(async (req: Request, res: Response) => {
    const data = await ExportUserDataService(req.userId);
    if (!data) throw new NotFoundException("Usuário não encontrado.", ErrorCode.USER_NOT_FOUND);
    return sendSuccess(res, data);
  });
}
