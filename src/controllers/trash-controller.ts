import { Request, Response } from "express";
import { ValidationException } from "../exceptions/validation.ts";
import { TrashItemSchema } from "../schemas/trash-schema.ts";
import { AuthorizeRequestService } from "../services/authorization-service.ts";
import {
  DeleteTrashItemForeverService,
  FindTrashByUserService,
  RestoreTrashItemService,
} from "../services/trash-service.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

async function parseItem(req: Request) {
  const result = TrashItemSchema.safeParse(req.params);
  if (!result.success) throw new ValidationException("O item da lixeira é inválido. Atualize a página.", result);
  await AuthorizeRequestService(req.userId, result.data.kind, { id: result.data.id }, undefined);
  return result.data;
}

export class TrashController {
  GetTrash = ErrorHandler(async (req: Request, res: Response) => {
    return sendSuccess(res, await FindTrashByUserService(req.userId));
  });

  Restore = ErrorHandler(async (req: Request, res: Response) => {
    const { kind, id } = await parseItem(req);
    await RestoreTrashItemService(kind, id);
    return sendSuccess(res, null, "Item restored");
  });

  DeleteForever = ErrorHandler(async (req: Request, res: Response) => {
    const { kind, id } = await parseItem(req);
    await DeleteTrashItemForeverService(kind, id);
    return sendSuccess(res, null, "Item deleted forever");
  });
}
