import { Request, Response } from "express";
import { ValidationException } from "../exceptions/validation.ts";
import {
  CreateShareInviteSchema,
  ShareContentQuerySchema,
  ShareFileParamsSchema,
  ShareIdSchema,
  ShareTokenSchema,
  UpsertShareLinkSchema,
} from "../schemas/share-schema.ts";
import {
  CreateShareInviteService,
  FindSharesByOwnerService,
  FindSharesReceivedService,
  LeaveShareService,
  ReadPublicShareService,
  ReadReceivedShareService,
  RevokeShareInviteService,
  RevokeShareLinkService,
  SignPublicShareFileService,
  SignReceivedShareFileService,
  UpsertShareLinkService,
} from "../services/share-service.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

const invalid = "Os dados do compartilhamento são inválidos. Confira e tente novamente.";

function parse<T extends { safeParse: (input: unknown) => { success: boolean; data?: unknown } }>(schema: T, input: unknown) {
  const result = schema.safeParse(input) as ReturnType<T["safeParse"]>;
  if (!result.success) throw new ValidationException(invalid, result as never);
  return result.data as Extract<ReturnType<T["safeParse"]>, { success: true }>["data"];
}

export class ShareController {
  GetMine = ErrorHandler(async (req: Request, res: Response) => {
    return sendSuccess(res, await FindSharesByOwnerService(req.userId));
  });

  UpsertLink = ErrorHandler(async (req: Request, res: Response) => {
    const { target, expiresIn } = parse(UpsertShareLinkSchema, req.body);
    return sendSuccess(res, await UpsertShareLinkService(req.userId, target, expiresIn), "Link saved");
  });

  RevokeLink = ErrorHandler(async (req: Request, res: Response) => {
    await RevokeShareLinkService(req.userId, parse(ShareIdSchema, req.params).id);
    return sendSuccess(res, null, "Link revoked");
  });

  CreateInvite = ErrorHandler(async (req: Request, res: Response) => {
    const { target, email } = parse(CreateShareInviteSchema, req.body);
    return sendSuccess(res, await CreateShareInviteService(req.userId, target, email), "Invite saved", 201);
  });

  RevokeInvite = ErrorHandler(async (req: Request, res: Response) => {
    await RevokeShareInviteService(req.userId, parse(ShareIdSchema, req.params).id);
    return sendSuccess(res, null, "Invite revoked");
  });

  GetReceived = ErrorHandler(async (req: Request, res: Response) => {
    return sendSuccess(res, await FindSharesReceivedService(req.userId));
  });

  LeaveReceived = ErrorHandler(async (req: Request, res: Response) => {
    await LeaveShareService(req.userId, parse(ShareIdSchema, req.params).id);
    return sendSuccess(res, null, "Share removed");
  });

  ReadReceived = ErrorHandler(async (req: Request, res: Response) => {
    const { id } = parse(ShareIdSchema, req.params);
    const { folderId } = parse(ShareContentQuerySchema, req.query);
    return sendSuccess(res, await ReadReceivedShareService(req.userId, id, folderId));
  });

  SignReceivedFile = ErrorHandler(async (req: Request, res: Response) => {
    const { id } = parse(ShareIdSchema, req.params);
    const { materialId } = parse(ShareFileParamsSchema, req.params);
    return sendSuccess(res, await SignReceivedShareFileService(req.userId, id, materialId));
  });

  ReadPublic = ErrorHandler(async (req: Request, res: Response) => {
    const { token } = parse(ShareTokenSchema, req.params);
    const { folderId } = parse(ShareContentQuerySchema, req.query);
    return sendSuccess(res, await ReadPublicShareService(token, folderId));
  });

  SignPublicFile = ErrorHandler(async (req: Request, res: Response) => {
    const { token } = parse(ShareTokenSchema, req.params);
    const { materialId } = parse(ShareFileParamsSchema, req.params);
    return sendSuccess(res, await SignPublicShareFileService(token, materialId));
  });
}
