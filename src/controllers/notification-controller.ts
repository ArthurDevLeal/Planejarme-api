import { Request, Response } from "express";
import { BadRequestsException } from "../exceptions/bad-requests";
import { NotFoundException } from "../exceptions/not-found";
import { ErrorCode } from "../exceptions/root";
import {
  CreateNotificationSchema,
  NotificationIdSchema,
  UpdateNotificationSchema,
  UserIdSchema,
} from "../schemas/notification-schema";
import {
  CreateNotificationService,
  DeleteNotificationService,
  FindNotificationByIdService,
  FindNotificationsByUserService,
  FindUnreadNotificationsByUserService,
  MarkNotificationAsReadService,
  UpdateNotificationService,
} from "../services/notification-service";
import { sendSuccess } from "../utils/api-response";
import { ErrorHandler } from "../utils/error-handler";

export class NotificationController {
  GetUnreadNotificationsByUser = ErrorHandler(async (req: Request, res: Response) => {
    const result = UserIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid user id", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await FindUnreadNotificationsByUserService(result.data.userId));
  });

  GetNotificationById = ErrorHandler(async (req: Request, res: Response) => {
    const result = NotificationIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid notification id", ErrorCode.INVALID_DATA);
    const notification = await FindNotificationByIdService(result.data.id);
    if (!notification) throw new NotFoundException("Notification not found", ErrorCode.INVALID_DATA);
    return sendSuccess(res, notification);
  });

  GetNotificationsByUser = ErrorHandler(async (req: Request, res: Response) => {
    const result = UserIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid user id", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await FindNotificationsByUserService(result.data.userId));
  });

  CreateNotification = ErrorHandler(async (req: Request, res: Response) => {
    const result = CreateNotificationSchema.safeParse(req.body);
    if (!result.success) throw new BadRequestsException("Invalid data", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await CreateNotificationService(result.data), "Notification created", 201);
  });

  UpdateNotification = ErrorHandler(async (req: Request, res: Response) => {
    const params = NotificationIdSchema.safeParse(req.params);
    const body = UpdateNotificationSchema.safeParse(req.body);
    if (!params.success || !body.success)
      throw new BadRequestsException("Invalid data", ErrorCode.INVALID_DATA);
    return sendSuccess(
      res,
      await UpdateNotificationService(params.data.id, body.data),
      "Notification updated",
    );
  });

  MarkNotificationAsRead = ErrorHandler(async (req: Request, res: Response) => {
    const result = NotificationIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid notification id", ErrorCode.INVALID_DATA);
    return sendSuccess(
      res,
      await MarkNotificationAsReadService(result.data.id),
      "Notification marked as read",
    );
  });

  DeleteNotification = ErrorHandler(async (req: Request, res: Response) => {
    const result = NotificationIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid notification id", ErrorCode.INVALID_DATA);
    await DeleteNotificationService(result.data.id);
    return sendSuccess(res, null, "Notification deleted");
  });
}
