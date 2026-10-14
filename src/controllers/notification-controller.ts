import { ValidationException } from "../exceptions/validation.ts";
import { Request, Response } from "express";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import {
  CreateNotificationSchema,
  NotificationIdSchema,
  UpdateNotificationSchema,
  UserIdSchema,
} from "../schemas/notification-schema.ts";
import {
  CreateNotificationService,
  DeleteNotificationService,
  FindNotificationByIdService,
  FindNotificationsByUserService,
  FindUnreadNotificationsByUserService,
  MarkNotificationAsReadService,
  UpdateNotificationService,
} from "../services/notification-service.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

export class NotificationController {
  GetUnreadNotificationsByUser = ErrorHandler(async (req: Request, res: Response) => {
    const result = UserIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de usuário é inválido. Confira o registro selecionado.", result);
    return sendSuccess(res, await FindUnreadNotificationsByUserService(result.data.userId));
  });

  GetNotificationById = ErrorHandler(async (req: Request, res: Response) => {
    const result = NotificationIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de notificação é inválido. Confira o registro selecionado.", result);
    const notification = await FindNotificationByIdService(result.data.id);
    if (!notification) throw new NotFoundException("Notificação não encontrada. O registro pode ter sido removido. Atualize a página e tente novamente.", ErrorCode.NOTIFICATION_NOT_FOUND);
    return sendSuccess(res, notification);
  });

  GetNotificationsByUser = ErrorHandler(async (req: Request, res: Response) => {
    const result = UserIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de usuário é inválido. Confira o registro selecionado.", result);
    return sendSuccess(res, await FindNotificationsByUserService(result.data.userId));
  });

  CreateNotification = ErrorHandler(async (req: Request, res: Response) => {
    const result = CreateNotificationSchema.safeParse(req.body);
    if (!result.success) throw new ValidationException("Os dados enviados são inválidos. Confira os campos indicados e tente novamente.", result);
    return sendSuccess(res, await CreateNotificationService(result.data), "Notification created", 201);
  });

  UpdateNotification = ErrorHandler(async (req: Request, res: Response) => {
    const params = NotificationIdSchema.safeParse(req.params);
    const body = UpdateNotificationSchema.safeParse(req.body);
    if (!params.success || !body.success)
      throw new ValidationException("Os dados enviados são inválidos. Confira os campos indicados e tente novamente.", params, body);
    return sendSuccess(
      res,
      await UpdateNotificationService(params.data.id, body.data),
      "Notification updated",
    );
  });

  MarkNotificationAsRead = ErrorHandler(async (req: Request, res: Response) => {
    const result = NotificationIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de notificação é inválido. Confira o registro selecionado.", result);
    return sendSuccess(
      res,
      await MarkNotificationAsReadService(result.data.id),
      "Notification marked as read",
    );
  });

  DeleteNotification = ErrorHandler(async (req: Request, res: Response) => {
    const result = NotificationIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de notificação é inválido. Confira o registro selecionado.", result);
    await DeleteNotificationService(result.data.id);
    return sendSuccess(res, null, "Notification deleted");
  });
}
