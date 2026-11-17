import { RequestHandler } from "express";

export const ErrorHandler = (method: RequestHandler): RequestHandler => {
  return async(req, res, next) => {
    try {
      await method(req, res, next);
    } catch (error) {
      // Erro original: o ErrorMiddleware normaliza e registra/reporta o 5xx com a causa real.
      next(error);
    }
  };
};
