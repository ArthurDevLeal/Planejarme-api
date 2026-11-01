import { ValidationException } from "../exceptions/validation.ts";
import { AuthorizeRequestService } from "../services/authorization-service.ts";
import { Request, Response } from "express";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import {
  CreateInboxItemSchema,
  InboxItemIdSchema,
  UpdateInboxItemSchema,
  UserIdSchema,
} from "../schemas/inbox-item-schema.ts";
import {
  CreateInboxItemService,
  DeleteInboxItemService,
  FindInboxItemByIdService,
  FindInboxItemsByUserService,
  UpdateInboxItemService,
} from "../services/inbox-item-service.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

export class InboxItemController {
  GetInboxItemById = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "inbox", req.params, req.body);
    const result = InboxItemIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de item da caixa de entrada é inválido. Confira o registro selecionado.", result);
    const item = await FindInboxItemByIdService(result.data.id);
    if (!item) throw new NotFoundException("Item da caixa de entrada não encontrado. O registro pode ter sido removido. Atualize a página e tente novamente.", ErrorCode.INBOX_ITEM_NOT_FOUND);
    return sendSuccess(res, item);
  });

  GetInboxItemsByUser = ErrorHandler(async (req: Request, res: Response) => {
    const targetUserId = req.params.userId === "me" ? req.userId : req.params.userId;
    await AuthorizeRequestService(req.userId, "inbox", { ...req.params, userId: targetUserId }, req.body);
    const result = UserIdSchema.safeParse({ userId: targetUserId });
    if (!result.success) throw new ValidationException("O identificador de usuário é inválido. Confira o registro selecionado.", result);
    return sendSuccess(res, await FindInboxItemsByUserService(result.data.userId));
  });

  CreateInboxItem = ErrorHandler(async (req: Request, res: Response) => {
    const rawUserId = req.body?.userId === "me" || !req.body?.userId ? req.userId : req.body.userId;
    const body = { ...req.body, userId: rawUserId };
    await AuthorizeRequestService(req.userId, "inbox", req.params, body);
    const result = CreateInboxItemSchema.safeParse(body);
    if (!result.success) throw new ValidationException("Os dados enviados são inválidos. Confira os campos indicados e tente novamente.", result);
    return sendSuccess(res, await CreateInboxItemService(result.data), "Inbox item created", 201);
  });

  UpdateInboxItem = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "inbox", req.params, req.body);
    const params = InboxItemIdSchema.safeParse(req.params);
    const body = UpdateInboxItemSchema.safeParse(req.body);
    if (!params.success || !body.success)
      throw new ValidationException("Os dados enviados são inválidos. Confira os campos indicados e tente novamente.", params, body);
    return sendSuccess(res, await UpdateInboxItemService(params.data.id, body.data), "Inbox item updated");
  });

  DeleteInboxItem = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "inbox", req.params, req.body);
    const result = InboxItemIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de item da caixa de entrada é inválido. Confira o registro selecionado.", result);
    await DeleteInboxItemService(result.data.id);
    return sendSuccess(res, null, "Inbox item deleted");
  });
}
