import { Request, Response } from "express";
import { ValidationException } from "../exceptions/validation.ts";
import { DisciplineIdSchema } from "../schemas/discipline-schema.ts";
import { ShareTokenSchema } from "../schemas/share-schema.ts";
import { AuthorizeRequestService } from "../services/authorization-service.ts";
import {
  CreateOrGetClassTemplateService,
  GetClassTemplatePreviewService,
  GetClassTemplateService,
  ImportClassTemplateService,
  RevokeClassTemplateService,
} from "../services/class-template-service.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

async function ownDisciplineId(req: Request) {
  await AuthorizeRequestService(req.userId, "discipline", req.params, req.body);
  const result = DisciplineIdSchema.safeParse(req.params);
  if (!result.success) throw new ValidationException("O identificador de disciplina é inválido. Confira o registro selecionado.", result);
  return result.data.id;
}

function tokenOf(req: Request) {
  const result = ShareTokenSchema.safeParse(req.params);
  if (!result.success) throw new ValidationException("Este link da turma é inválido. Confira o endereço.", result);
  return result.data.token;
}

export class ClassTemplateController {
  Get = ErrorHandler(async (req: Request, res: Response) => {
    return sendSuccess(res, await GetClassTemplateService(await ownDisciplineId(req)));
  });

  Create = ErrorHandler(async (req: Request, res: Response) => {
    return sendSuccess(res, await CreateOrGetClassTemplateService(req.userId, await ownDisciplineId(req)), "Class template saved");
  });

  Revoke = ErrorHandler(async (req: Request, res: Response) => {
    await RevokeClassTemplateService(req.userId, await ownDisciplineId(req));
    return sendSuccess(res, null, "Class template revoked");
  });

  Preview = ErrorHandler(async (req: Request, res: Response) => {
    return sendSuccess(res, await GetClassTemplatePreviewService(tokenOf(req)));
  });

  Import = ErrorHandler(async (req: Request, res: Response) => {
    const result = await ImportClassTemplateService(req.userId, tokenOf(req));
    return sendSuccess(res, result, "Class template imported", result.alreadyImported ? 200 : 201);
  });
}
