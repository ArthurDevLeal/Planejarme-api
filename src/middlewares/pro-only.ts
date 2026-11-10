import { NextFunction, Request, Response } from "express";
import { planOf } from "../config/plans.ts";
import { ForbiddenException } from "../exceptions/forbidden.ts";
import { ErrorCode } from "../exceptions/root.ts";

export const PRO_ONLY_MESSAGE = "A central de arquivos é do plano Pro. Assine o Pro para enviar arquivos, criar pastas, atalhos e compartilhar.";

/**
 * Bloqueia só o que cria ou altera. Ler, baixar e apagar continuam livres: quem saiu do Pro não perde acesso ao que já guardou.
 * Vem depois do AuthMiddleware.
 */
export async function ProOnlyWrites(req: Request, _res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "DELETE") return next();
  try {
    if ((await planOf(req.userId!)) !== "PRO") return next(new ForbiddenException(PRO_ONLY_MESSAGE, ErrorCode.PLAN_LIMIT_REACHED));
    next();
  } catch (error) {
    next(error);
  }
}
