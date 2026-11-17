import { NextFunction, Request, Response } from "express";
import { reportError } from "../lib/sentry.ts";
import { normalizeError } from "../utils/normalize-error.ts";

// A mensagem de erro do Prisma traz os valores da consulta (e-mail, hash de senha): só nome e código saem.
function safeError(error: unknown) {
  const value = error !== null && typeof error === "object" ? (error as { name?: unknown; code?: unknown; stack?: unknown }) : {};
  if (typeof value.name !== "string" || !value.name.startsWith("PrismaClient")) return error;
  const safe = new Error(`${value.name} ${typeof value.code === "string" ? value.code : ""}`.trim());
  if (typeof value.stack === "string") {
    const frames = value.stack.split("\n").filter((line) => /^\s+at /.test(line));
    safe.stack = [safe.message, ...frames].join("\n");
  }
  return safe;
}

export async function ErrorMiddleware(error: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(error);
  const exception = normalizeError(error);
  if (exception.statusCode >= 500) {
    const safe = safeError(error);
    console.error("[http]", req.method, req.path, safe);
    await reportError(safe);
  }
  res.status(exception.statusCode).json({
    success: false,
    data: null,
    message: exception.message,
    errorCode: exception.errorCode,
    errors: exception.errors,
  });
}
