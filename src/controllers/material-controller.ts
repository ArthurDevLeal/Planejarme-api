import { Request, Response } from "express";
import crypto from "node:crypto";
import { BadRequestsException } from "../exceptions/bad-requests.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { ValidationException } from "../exceptions/validation.ts";
import { supabase, SUPABASE_STORAGE_BUCKET } from "../lib/supabase.ts";
import { AuthorizeRequestService } from "../services/authorization-service.ts";
import {
  CreateMaterialSchema,
  DisciplineIdSchema,
  GetMaterialsQuerySchema,
  MaterialIdSchema,
  TaskIdSchema,
  UpdateMaterialSchema,
} from "../schemas/material-schema.ts";
import { UserIdSchema } from "../schemas/user-schema.ts";
import {
  CreateMaterialService,
  DeleteMaterialService,
  FindMaterialByIdService,
  FindMaterialsByDisciplineService,
  FindMaterialsByTaskService,
  FindMaterialsByUserService,
  UpdateMaterialService,
} from "../services/material-service.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

function decodeOriginalName(originalname: string): string {
  try {
    const converted = Buffer.from(originalname, "latin1").toString("utf8");
    if (!converted.includes("\uFFFD")) {
      return converted;
    }
  } catch {
  }
  return originalname;
}

function sanitizeFilename(filename: string): string {
  return filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class MaterialController {
  GetMaterialsByUser = ErrorHandler(async (req: Request, res: Response) => {
    const result = UserIdSchema.safeParse(req.params);
    if (!result.success) {
      throw new ValidationException(
        "O identificador de usuário é inválido. Confira o registro selecionado.",
        result
      );
    }
    const targetUserId = result.data.userId === "me" ? req.userId : result.data.userId;
    await AuthorizeRequestService(req.userId, "material", { userId: targetUserId }, undefined);
    const queryResult = GetMaterialsQuerySchema.safeParse(req.query);
    const semesterId = queryResult.success && queryResult.data.semesterId && queryResult.data.semesterId !== "undefined" && queryResult.data.semesterId !== "null"
      ? queryResult.data.semesterId
      : undefined;
    return sendSuccess(res, await FindMaterialsByUserService(targetUserId, semesterId));
  });

  GetMaterialById = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "material", req.params, req.body);
    const result = MaterialIdSchema.safeParse(req.params);
    if (!result.success) {
      throw new ValidationException(
        "O identificador de material é inválido. Confira o registro selecionado.",
        result
      );
    }
    const material = await FindMaterialByIdService(result.data.id);
    if (!material) {
      throw new NotFoundException(
        "Material não encontrado. O registro pode ter sido removido. Atualize a página e tente novamente.",
        ErrorCode.MATERIAL_NOT_FOUND
      );
    }
    return sendSuccess(res, material);
  });

  GetMaterialDownloadUrl = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "material", req.params, req.body);
    const result = MaterialIdSchema.safeParse(req.params);
    if (!result.success) {
      throw new ValidationException(
        "O identificador de material é inválido. Confira o registro selecionado.",
        result
      );
    }
    const material = await FindMaterialByIdService(result.data.id);
    if (!material) {
      throw new NotFoundException(
        "Material não encontrado. O registro pode ter sido removido. Atualize a página e tente novamente.",
        ErrorCode.MATERIAL_NOT_FOUND
      );
    }

    if (material.storagePath) {
      const { data, error } = await supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .createSignedUrl(material.storagePath, 3600);

      if (error || !data?.signedUrl) {
        throw new BadRequestsException(
          "Não foi possível gerar a URL de download no momento.",
          ErrorCode.INVALID_DATA,
          error
        );
      }
      return sendSuccess(res, { downloadUrl: data.signedUrl });
    }

    if (material.url) {
      return sendSuccess(res, { downloadUrl: material.url });
    }

    throw new NotFoundException(
      "Link de download não encontrado para este material.",
      ErrorCode.MATERIAL_NOT_FOUND
    );
  });

  GetMaterialsByDiscipline = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "material", req.params, req.body);
    const result = DisciplineIdSchema.safeParse(req.params);
    if (!result.success) {
      throw new ValidationException(
        "O identificador de disciplina é inválido. Confira o registro selecionado.",
        result
      );
    }
    return sendSuccess(res, await FindMaterialsByDisciplineService(result.data.disciplineId));
  });

  GetMaterialsByTask = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "material", req.params, req.body);
    const result = TaskIdSchema.safeParse(req.params);
    if (!result.success) {
      throw new ValidationException("O identificador de tarefa é inválido. Confira o registro selecionado.", result);
    }
    return sendSuccess(res, await FindMaterialsByTaskService(result.data.taskId));
  });

  UploadMaterial = ErrorHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new BadRequestsException(
        "Nenhum arquivo enviado. Selecione um arquivo para upload.",
        ErrorCode.INVALID_DATA
      );
    }

    const userId = req.userId;
    const disciplineId = typeof req.body.disciplineId === "string" && req.body.disciplineId.trim().length > 0
      ? req.body.disciplineId.trim()
      : null;
    const taskId = typeof req.body.taskId === "string" && req.body.taskId.trim().length > 0 ? req.body.taskId.trim() : null;
    const folderId = typeof req.body.folderId === "string" && req.body.folderId.trim().length > 0 ? req.body.folderId.trim() : null;
    await AuthorizeRequestService(userId, "material", {}, { disciplineId, taskId, folderId });
    const originalName = decodeOriginalName(req.file.originalname);
    const safeName = sanitizeFilename(originalName);
    const extension = originalName.includes(".") ? originalName.split(".").pop()?.toUpperCase() ?? "FILE" : "FILE";
    const storagePath = `${userId}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      throw new BadRequestsException(
        `Falha ao salvar arquivo no Supabase Storage: ${uploadError.message}`,
        ErrorCode.INVALID_DATA,
        uploadError
      );
    }

    const title = typeof req.body.title === "string" && req.body.title.trim().length > 0
      ? req.body.title.trim()
      : originalName;

    const fileSizeMb = Number((req.file.size / (1024 * 1024)).toFixed(2));

    const material = await CreateMaterialService({
      title,
      type: extension,
      url: "",
      fileSizeMb,
      mimeType: req.file.mimetype,
      storagePath,
      userId,
      disciplineId,
      taskId,
      folderId,
    });

    return sendSuccess(res, material, "Material enviado com sucesso", 201);
  });

  CreateMaterial = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "material", req.params, req.body);
    const result = CreateMaterialSchema.safeParse(req.body);
    if (!result.success) {
      throw new ValidationException(
        "Os dados enviados são inválidos. Confira os campos indicados e tente novamente.",
        result
      );
    }
    return sendSuccess(res, await CreateMaterialService({ ...result.data, userId: req.userId }), "Material created", 201);
  });

  UpdateMaterial = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "material", req.params, req.body);
    const params = MaterialIdSchema.safeParse(req.params);
    const body = UpdateMaterialSchema.safeParse(req.body);
    if (!params.success || !body.success) {
      throw new ValidationException(
        "Os dados enviados são inválidos. Confira os campos indicados e tente novamente.",
        params,
        body
      );
    }
    return sendSuccess(res, await UpdateMaterialService(params.data.id, body.data), "Material updated");
  });

  DeleteMaterial = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "material", req.params, req.body);
    const result = MaterialIdSchema.safeParse(req.params);
    if (!result.success) {
      throw new ValidationException(
        "O identificador de material é inválido. Confira o registro selecionado.",
        result
      );
    }
    await DeleteMaterialService(result.data.id);
    return sendSuccess(res, null, "Material moved to trash");
  });
}
