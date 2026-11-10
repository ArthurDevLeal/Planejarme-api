import { Request, Response } from "express";
import crypto from "node:crypto";
import { ErrorCode } from "../exceptions/root.ts";
import { UnauthorizedException } from "../exceptions/unauthorized.ts";
import { GenerateDueNotificationsService } from "../services/notification-generator-service.ts";
import { RetryStorageDeletionsService, SweepOrphanObjectsService } from "../services/storage-service.ts";
import { PurgeExpiredTrashService } from "../services/trash-service.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

function isCronRequest(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Sem segredo configurado a rota fica fechada, nunca aberta.
  if (!secret) return false;
  const received = Buffer.from(req.headers.authorization ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export class CronController {
  Daily = ErrorHandler(async (req: Request, res: Response) => {
    if (!isCronRequest(req)) {
      throw new UnauthorizedException("Acesso restrito ao agendador.", ErrorCode.UNAUTHORIZED);
    }
    const notifications = await GenerateDueNotificationsService();
    const purged = await PurgeExpiredTrashService();
    const retried = await RetryStorageDeletionsService();
    const swept = await SweepOrphanObjectsService();
    return sendSuccess(
      res,
      { notificationsCreated: notifications.created, trashPurged: purged, storageRetried: retried, storageSwept: swept },
      "Daily jobs finished",
    );
  });
}
