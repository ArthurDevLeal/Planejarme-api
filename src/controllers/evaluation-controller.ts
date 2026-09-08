import { Request, Response } from "express";
import { BadRequestsException } from "../exceptions/bad-requests";
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
    if (!result.success) throw new BadRequestsException("Invalid discipline id", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await FindEvaluationSummaryService(result.data.disciplineId));
  });

  GetEvaluationById = ErrorHandler(async (req: Request, res: Response) => {
    const result = EvaluationIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid evaluation id", ErrorCode.INVALID_DATA);
    const evaluation = await FindEvaluationByIdService(result.data.id);
    if (!evaluation) throw new NotFoundException("Evaluation not found", ErrorCode.INVALID_DATA);
    return sendSuccess(res, evaluation);
  });

  GetEvaluationsByDiscipline = ErrorHandler(async (req: Request, res: Response) => {
    const result = DisciplineIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid discipline id", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await FindEvaluationsByDisciplineService(result.data.disciplineId));
  });

  CreateEvaluation = ErrorHandler(async (req: Request, res: Response) => {
    const result = CreateEvaluationSchema.safeParse(req.body);
    if (!result.success) throw new BadRequestsException("Invalid data", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await CreateEvaluationService(result.data), "Evaluation created", 201);
  });

  UpdateEvaluation = ErrorHandler(async (req: Request, res: Response) => {
    const params = EvaluationIdSchema.safeParse(req.params);
    const body = UpdateEvaluationSchema.safeParse(req.body);
    if (!params.success || !body.success)
      throw new BadRequestsException("Invalid data", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await UpdateEvaluationService(params.data.id, body.data), "Evaluation updated");
  });

  DeleteEvaluation = ErrorHandler(async (req: Request, res: Response) => {
    const result = EvaluationIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid evaluation id", ErrorCode.INVALID_DATA);
    await DeleteEvaluationService(result.data.id);
    return sendSuccess(res, null, "Evaluation deleted");
  });
}
