import { NextFunction, Request, Response } from "express";
import { InternalException } from "../exceptions/internal-exception";
import { ErrorCode, HttpException } from "../exceptions/root";

export const ErrorHandler = (method: Function) => {
  return async(req: Request, res: Response, next: NextFunction) => {
    try {
      await method(req, res, next);
    } catch (error: any) {
      let exception: HttpException;
      if (error instanceof HttpException) {
        exception = error;
      } else {
        exception = new InternalException("Internal Server Error", error, ErrorCode.INTERNAL_SERVER_ERROR);
      }
      next(exception);
    }
  };
};
