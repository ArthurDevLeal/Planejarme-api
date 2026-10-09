import { RequestHandler } from "express";
import { normalizeError } from "./normalize-error";

export const ErrorHandler = (method: RequestHandler): RequestHandler => {
  return async(req, res, next) => {
    try {
      await method(req, res, next);
    } catch (error) {
      next(normalizeError(error));
    }
  };
};
