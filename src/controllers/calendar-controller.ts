import { Request, Response } from "express";
import { CalendarFileParamsSchema } from "../schemas/calendar-schema.ts";
import {
  BuildCalendarByTokenService,
  GetCalendarUrlService,
  RevokeCalendarUrlService,
  RotateCalendarUrlService,
} from "../services/calendar-service.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

const baseUrl = (req: Request) => process.env.API_URL?.trim() || `${req.protocol}://${req.get("host")}`;

export class CalendarController {
  Get = ErrorHandler(async (req: Request, res: Response) => sendSuccess(res, await GetCalendarUrlService(req.userId!, baseUrl(req))));
  Rotate = ErrorHandler(async (req: Request, res: Response) => sendSuccess(res, await RotateCalendarUrlService(req.userId!, baseUrl(req))));
  Revoke = ErrorHandler(async (req: Request, res: Response) => sendSuccess(res, await RevokeCalendarUrlService(req.userId!)));

  // Resposta crua (não JSON): quem consome é o app de agenda do usuário.
  ReadPublic = ErrorHandler(async (req: Request, res: Response) => {
    const params = CalendarFileParamsSchema.safeParse(req.params);
    const ics = params.success ? await BuildCalendarByTokenService(params.data.token) : null;
    if (ics === null) return void res.status(404).type("text/plain").send("Calendário não encontrado.");
    res.set({ "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900" }).send(ics);
  });
}

