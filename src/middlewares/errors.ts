import { NextFunction, Request, Response } from "express";
import { reportError } from "../lib/sentry.ts";
import { normalizeError } from "../utils/normalize-error.ts";

export async function ErrorMiddleware(error: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(error);
  const exception = normalizeError(error);
  if (exception.statusCode >= 500) {
    console.error("[http]", req.method, req.path, error);
    await reportError(error);
  }
  res.status(exception.statusCode).json({
    success: false,
    data: null,
    message: exception.message,
    errorCode: exception.errorCode,
    errors: exception.errors,
  });
}
