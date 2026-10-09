import { NextFunction, Request, Response } from "express";
import { normalizeError } from "../utils/normalize-error";

export function ErrorMiddleware(error: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(error);
  const exception = normalizeError(error);
  res.status(exception.statusCode).json({
    success: false,
    data: null,
    message: exception.message,
    errorCode: exception.errorCode,
    errors: exception.errors,
  });
}
