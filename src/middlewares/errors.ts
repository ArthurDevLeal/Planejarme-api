import { NextFunction, Request, Response } from "express";
import { HttpException } from "../exceptions/root";

export function ErrorMiddleware(error: HttpException, req: Request, res: Response, next: NextFunction) {
  res.status(error.statusCode).json({
    success: false,
    data: null,
    message: error.message,
    errorCode: error.errorCode,
    errors: error.errors,
  });
}
