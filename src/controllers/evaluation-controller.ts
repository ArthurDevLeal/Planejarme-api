import { ValidationException } from "../exceptions/validation";
import { Request, Response } from "express";
import { NotFoundException } from "../exceptions/not-found";
import { ErrorCode } from "../exceptions/root";
import {
  CreateEvaluationSchema,
  DisciplineIdSchema,
  EvaluationIdSchema,
  UpdateEvaluationSchema,
} from "../schemas/evaluation-schema";
import {
  CreateEvaluationService,
  DeleteEvaluationService,
  FindEvaluationByIdService,
  FindEvaluationSummaryService,
  FindEvaluationsByDisciplineService,
  UpdateEvaluationService,
} from "../services/evaluation-service";
import { sendSuccess } from "../utils/api-response";
import { ErrorHandler } from "../utils/error-handler";

export class EvaluationController {
  GetEvaluationSummary = ErrorHandler(async (req: Request, res: Response) => {
    const result = DisciplineIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de disciplina é inválido. Confira o registro selecionado.", result);
    return sendSuccess(res, await FindEvaluationSummaryService(result.data.disciplineId));
  });

  GetEvaluationById = ErrorHandler(async (req: Request, res: Response) => {
    const result = EvaluationIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de avaliação é inválido. Confira o registro selecionado.", result);
    const evaluation = await FindEvaluationByIdService(result.data.id);
    if (!evaluation) throw new NotFoundException("Avaliação não encontrada. O registro pode ter sido removido. Atualize a página e tente novamente.", ErrorCode.EVALUATION_NOT_FOUND);
    return sendSuccess(res, evaluation);
  });

  GetEvaluationsByDiscipline = ErrorHandler(async (req: Request, res: Response) => {
    const result = DisciplineIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de disciplina é inválido. Confira o registro selecionado.", result);
    return sendSuccess(res, await FindEvaluationsByDisciplineService(result.data.disciplineId));
  });

  CreateEvaluation = ErrorHandler(async (req: Request, res: Response) => {
    const result = CreateEvaluationSchema.safeParse(req.body);
    if (!result.success) throw new ValidationException("Os dados enviados são inválidos. Confira os campos indicados e tente novamente.", result);
    return sendSuccess(res, await CreateEvaluationService(result.data), "Evaluation created", 201);
  });

  UpdateEvaluation = ErrorHandler(async (req: Request, res: Response) => {
    const params = EvaluationIdSchema.safeParse(req.params);
    const body = UpdateEvaluationSchema.safeParse(req.body);
    if (!params.success || !body.success)
      throw new ValidationException("Os dados enviados são inválidos. Confira os campos indicados e tente novamente.", params, body);
    return sendSuccess(res, await UpdateEvaluationService(params.data.id, body.data), "Evaluation updated");
  });

  DeleteEvaluation = ErrorHandler(async (req: Request, res: Response) => {
    const result = EvaluationIdSchema.safeParse(req.params);
    if (!result.success) throw new ValidationException("O identificador de avaliação é inválido. Confira o registro selecionado.", result);
    await DeleteEvaluationService(result.data.id);
    return sendSuccess(res, null, "Evaluation deleted");
  });
}
