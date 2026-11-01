import { NextFunction, Request, Response } from "express";
import { ErrorCode, HttpException } from "../exceptions/root.ts";

// shortcut: contador em memória por instância; na Vercel cada instância conta separado. Trocar por Redis/Upstash se houver abuso real.
export function RateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }

    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return next(
        new HttpException(
          "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
          ErrorCode.TOO_MANY_REQUESTS,
          429,
        ),
      );
    }
    next();
  };
}
