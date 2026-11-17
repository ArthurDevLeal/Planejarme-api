import { Request, Response } from "express";
import { ValidationException } from "../exceptions/validation.ts";
import { ReviewCheckBodySchema, ReviewCheckParamsSchema, ReviewsQuerySchema } from "../schemas/review-schema.ts";
import { ListReviewSessionsService, SetReviewDoneService } from "../services/review-service.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

const invalid = "Os dados da revisão são inválidos. Confira e tente novamente.";

export class ReviewController {
  List = ErrorHandler(async (req: Request, res: Response) => {
    const query = ReviewsQuerySchema.safeParse(req.query);
    if (!query.success) throw new ValidationException(invalid, query);
    return sendSuccess(res, await ListReviewSessionsService(req.userId!, query.data.days));
  });

  SetDone = ErrorHandler(async (req: Request, res: Response) => {
    const params = ReviewCheckParamsSchema.safeParse(req.params);
    const body = ReviewCheckBodySchema.safeParse(req.body);
    if (!params.success || !body.success) throw new ValidationException(invalid, params, body);
    return sendSuccess(res, await SetReviewDoneService(req.userId!, params.data.evaluationId, params.data.day, body.data.done));
  });
}
