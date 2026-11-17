import { Request, Response } from "express";
import { ValidationException } from "../exceptions/validation.ts";
import { CreateDeckSchema, IdSchema, ListDecksSchema, ReviewSchema } from "../schemas/flashcard-schema.ts";
import { AuthorizeRequestService } from "../services/authorization-service.ts";
import { CreateDeckService, DeleteDeckService, GetDeckService, ListDecksService, ReviewCardService, StudyDeckService } from "../services/flashcard-service.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

const INVALID = "Os dados enviados são inválidos. Confira os campos indicados e tente novamente.";

// A posse de baralho e cartão é conferida no serviço (busca sempre por id + userId).
export class FlashcardController {
  CreateDeck = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "discipline", {}, req.body);
    const result = CreateDeckSchema.safeParse(req.body);
    if (!result.success) throw new ValidationException(INVALID, result);
    return sendSuccess(res, await CreateDeckService(req.userId, result.data), "Deck created", 201);
  });

  ListDecks = ErrorHandler(async (req: Request, res: Response) => {
    const result = ListDecksSchema.safeParse(req.query);
    if (!result.success) throw new ValidationException("O identificador de disciplina é inválido.", result);
    return sendSuccess(res, await ListDecksService(req.userId, result.data.disciplineId));
  });

  GetDeck = ErrorHandler(async (req: Request, res: Response) => {
    const result = IdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador do baralho é inválido.", result);
    return sendSuccess(res, await GetDeckService(req.userId, result.data.id));
  });

  StudyDeck = ErrorHandler(async (req: Request, res: Response) => {
    const result = IdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador do baralho é inválido.", result);
    return sendSuccess(res, await StudyDeckService(req.userId, result.data.id));
  });

  ReviewCard = ErrorHandler(async (req: Request, res: Response) => {
    const params = IdSchema.safeParse(req.params);
    const body = ReviewSchema.safeParse(req.body);
    if (!params.success || !body.success) throw new ValidationException(INVALID, params, body);
    return sendSuccess(res, await ReviewCardService(req.userId, params.data.id, body.data.grade), "Card reviewed");
  });

  DeleteDeck = ErrorHandler(async (req: Request, res: Response) => {
    const result = IdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador do baralho é inválido.", result);
    await DeleteDeckService(req.userId, result.data.id);
    return sendSuccess(res, null, "Deck deleted");
  });
}
