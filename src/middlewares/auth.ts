import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedException } from "../exceptions/unauthorized";
import { ErrorCode } from "../exceptions/root";

type JwtPayload = {
  id: string;
  iat: number;
  exp: number;
};
export function AuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const { authorization } = req.headers;

  if (!authorization) {
    return next(new UnauthorizedException("Você precisa entrar na sua conta para continuar.", ErrorCode.UNAUTHORIZED));
  }

  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!match) {
    return next(new UnauthorizedException("O token de acesso é inválido. Entre novamente para continuar.", ErrorCode.AUTH_TOKEN_INVALID));
  }
  const token = match[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    if (typeof decoded === "string" || typeof decoded.id !== "string" || !decoded.id) {
      return next(new UnauthorizedException("O token de acesso é inválido. Entre novamente para continuar.", ErrorCode.AUTH_TOKEN_INVALID));
    }
    const { id } = decoded as JwtPayload;
    req.userId = id;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedException("Sua sessão expirou. Entre novamente para continuar.", ErrorCode.AUTH_TOKEN_EXPIRED));
    }
    if (error instanceof jwt.NotBeforeError) {
      return next(new UnauthorizedException("O token de acesso ainda não é válido. Entre novamente para continuar.", ErrorCode.AUTH_TOKEN_INVALID));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new UnauthorizedException("O token de acesso é inválido. Entre novamente para continuar.", ErrorCode.AUTH_TOKEN_INVALID));
    }
    return next(error);
  }
}
