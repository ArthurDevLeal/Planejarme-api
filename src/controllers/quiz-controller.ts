import { Request, Response } from "express";
import { ValidationException } from "../exceptions/validation.ts";
import { CreateQuizSchema, ListQuizzesSchema, QuizIdSchema, SubmitQuizAnswersSchema } from "../schemas/quiz-schema.ts";
import { AuthorizeRequestService } from "../services/authorization-service.ts";
import { CreateQuizService, GetQuizService, ListQuizzesService, RetryQuizService, SubmitQuizAnswersService } from "../services/quiz-service.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

// A posse do simulado é conferida no serviço (busca sempre por id + userId).
export class QuizController {
  CreateQuiz = ErrorHandler(async (req: Request, res: Response) => {
    await AuthorizeRequestService(req.userId, "discipline", {}, req.body);
    const result = CreateQuizSchema.safeParse(req.body);
    if (!result.success) throw new ValidationException("Os dados enviados são inválidos. Confira os campos indicados e tente novamente.", result);
    return sendSuccess(res, await CreateQuizService(req.userId, result.data), "Quiz created", 201);
  });

  ListQuizzes = ErrorHandler(async (req: Request, res: Response) => {
    const result = ListQuizzesSchema.safeParse(req.query);
    if (!result.success) throw new ValidationException("O identificador de disciplina é inválido.", result);
    return sendSuccess(res, await ListQuizzesService(req.userId, result.data.disciplineId));
  });

  GetQuiz = ErrorHandler(async (req: Request, res: Response) => {
    const result = QuizIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador do simulado é inválido.", result);
    return sendSuccess(res, await GetQuizService(req.userId, result.data.id));
  });

  SubmitAnswers = ErrorHandler(async (req: Request, res: Response) => {
    const params = QuizIdSchema.safeParse(req.params);
    const body = SubmitQuizAnswersSchema.safeParse(req.body);
    if (!params.success || !body.success) throw new ValidationException("Os dados enviados são inválidos. Confira os campos indicados e tente novamente.", params, body);
    return sendSuccess(res, await SubmitQuizAnswersService(req.userId, params.data.id, body.data), "Quiz graded");
  });

  RetryQuiz = ErrorHandler(async (req: Request, res: Response) => {
    const result = QuizIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador do simulado é inválido.", result);
    return sendSuccess(res, await RetryQuizService(req.userId, result.data.id), "Quiz retry created", 201);
  });
}
