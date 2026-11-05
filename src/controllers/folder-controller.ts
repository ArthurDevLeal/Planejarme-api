import { Request, Response } from "express";
import { ValidationException } from "../exceptions/validation.ts";
import { CreateFolderSchema, FolderIdSchema, MoveFolderSchema, RenameFolderSchema } from "../schemas/folder-schema.ts";
import { AuthorizeRequestService } from "../services/authorization-service.ts";
import {
  CreateFolderService,
  FindFoldersByUserService,
  MoveFolderService,
  RenameFolderService,
  TrashFolderService,
} from "../services/folder-service.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

const invalid = "Os dados da pasta são inválidos. Confira e tente novamente.";

async function ownedFolderId(req: Request, body?: unknown) {
  const result = FolderIdSchema.safeParse(req.params);
  if (!result.success) throw new ValidationException("O identificador da pasta é inválido.", result);
  await AuthorizeRequestService(req.userId, "folder", result.data, body);
  return result.data.id;
}

export class FolderController {
  GetFolders = ErrorHandler(async (req: Request, res: Response) => {
    return sendSuccess(res, await FindFoldersByUserService(req.userId));
  });

  CreateFolder = ErrorHandler(async (req: Request, res: Response) => {
    const result = CreateFolderSchema.safeParse(req.body);
    if (!result.success) throw new ValidationException(invalid, result);
    await AuthorizeRequestService(req.userId, "folder", {}, result.data);
    return sendSuccess(res, await CreateFolderService(req.userId, result.data), "Folder created", 201);
  });

  RenameFolder = ErrorHandler(async (req: Request, res: Response) => {
    const id = await ownedFolderId(req);
    const result = RenameFolderSchema.safeParse(req.body);
    if (!result.success) throw new ValidationException(invalid, result);
    return sendSuccess(res, await RenameFolderService(id, result.data.name), "Folder renamed");
  });

  MoveFolder = ErrorHandler(async (req: Request, res: Response) => {
    const result = MoveFolderSchema.safeParse(req.body);
    if (!result.success) throw new ValidationException(invalid, result);
    const id = await ownedFolderId(req, result.data);
    return sendSuccess(res, await MoveFolderService(id, req.userId, result.data), "Folder moved");
  });

  DeleteFolder = ErrorHandler(async (req: Request, res: Response) => {
    const id = await ownedFolderId(req);
    await TrashFolderService(id, req.userId);
    return sendSuccess(res, null, "Folder moved to trash");
  });
}
