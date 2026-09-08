import { Request, Response } from "express";
import { BadRequestsException } from "../exceptions/bad-requests";
import { NotFoundException } from "../exceptions/not-found";
import { ErrorCode } from "../exceptions/root";
import {
  CreateInboxItemSchema,
  InboxItemIdSchema,
  UpdateInboxItemSchema,
  UserIdSchema,
} from "../schemas/inbox-item-schema";
import {
  CreateInboxItemService,
  DeleteInboxItemService,
  FindInboxItemByIdService,
  FindInboxItemsByUserService,
  UpdateInboxItemService,
} from "../services/inbox-item-service";
import { sendSuccess } from "../utils/api-response";
import { ErrorHandler } from "../utils/error-handler";

export class InboxItemController {
  GetInboxItemById = ErrorHandler(async (req: Request, res: Response) => {
    const result = InboxItemIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid inbox item id", ErrorCode.INVALID_DATA);
    const item = await FindInboxItemByIdService(result.data.id);
    if (!item) throw new NotFoundException("Inbox item not found", ErrorCode.INVALID_DATA);
    return sendSuccess(res, item);
  });

  GetInboxItemsByUser = ErrorHandler(async (req: Request, res: Response) => {
    const result = UserIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid user id", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await FindInboxItemsByUserService(result.data.userId));
  });

  CreateInboxItem = ErrorHandler(async (req: Request, res: Response) => {
    const result = CreateInboxItemSchema.safeParse(req.body);
    if (!result.success) throw new BadRequestsException("Invalid data", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await CreateInboxItemService(result.data), "Inbox item created", 201);
  });

  UpdateInboxItem = ErrorHandler(async (req: Request, res: Response) => {
    const params = InboxItemIdSchema.safeParse(req.params);
    const body = UpdateInboxItemSchema.safeParse(req.body);
    if (!params.success || !body.success)
      throw new BadRequestsException("Invalid data", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await UpdateInboxItemService(params.data.id, body.data), "Inbox item updated");
  });

  DeleteInboxItem = ErrorHandler(async (req: Request, res: Response) => {
    const result = InboxItemIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid inbox item id", ErrorCode.INVALID_DATA);
    await DeleteInboxItemService(result.data.id);
    return sendSuccess(res, null, "Inbox item deleted");
  });
}
