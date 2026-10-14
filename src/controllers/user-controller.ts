import { AuthorizeRequestService } from "../services/authorization-service.ts";
import { ValidationException } from "../exceptions/validation.ts";
import { Request, Response } from "express";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { UserAlreadyExistsException } from "../exceptions/user-already-exists.ts";
import {
  CreateUserSchema,
  DeleteUserSchema,
  FindUserByIdSchema,
  UpdateUserSchema,
  UserIdSchema,
} from "../schemas/user-schema.ts";
import { CreateUserService } from "../services/user/create-user.ts";
import { DeleteUserService } from "../services/user/delete-user.ts";
import { FindUserByIdService } from "../services/user/find-user-by-id.ts";
import { GetUserDashboardService } from "../services/user/get-user-dashboard.ts";
import { UpdateUserService } from "../services/user/update-user.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

function withoutPasswordHash<T extends { passwordHash: string }>({ passwordHash: _, ...user }: T) {
  return user;
}

export class UserController {
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

    const user = await FindUserByIdService(result.data);
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

    const user = await UpdateUserService(params.data.id, body.data);
    return sendSuccess(res, withoutPasswordHash(user), "User updated");
  });

  DeleteUser = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "user", req.params, req.body);
    const result = DeleteUserSchema.safeParse(req.params);
    if (!result.success) {
      throw new ValidationException("O identificador de usuário é inválido. Confira o registro selecionado.", result);
    }

    await DeleteUserService(result.data);
    return sendSuccess(res, null, "User deleted");
  });
}
