import { Request, Response } from "express";
import crypto from "node:crypto";
import { ErrorCode } from "../exceptions/root.ts";
import { UnauthorizedException } from "../exceptions/unauthorized.ts";
import { GenerateDueNotificationsService } from "../services/notification-generator-service.ts";
import { GenerateRiskNotificationsService } from "../services/risk-notification-service.ts";
import { ExpireCanceledSubscriptionsService, ReleaseCommissionsService } from "../services/billing-service.ts";
import { RetryStorageDeletionsService, SweepOrphanObjectsService } from "../services/storage-service.ts";
import { PurgeExpiredTrashService } from "../services/trash-service.ts";
import { SendTrialEmailsService, SendWeeklyDigestService } from "../services/lifecycle-email-service.ts";
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
    // Um job que falha não derruba os seguintes: o erro vai para o log e o resultado dele fica ausente.
    const run = async <T>(name: string, job: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await job();
      } catch (err) {
        console.error("[cron]", name, err);
        return undefined;
      }
    };
    const notifications = await run("notifications", () => GenerateDueNotificationsService());
    const risk = await run("risk", () => GenerateRiskNotificationsService());
    const purged = await run("trash", () => PurgeExpiredTrashService());
    const retried = await run("storage-retry", () => RetryStorageDeletionsService());
    const swept = await run("storage-sweep", () => SweepOrphanObjectsService());
    const commissions = await run("commissions", () => ReleaseCommissionsService());
    const subscriptions = await run("subscriptions", () => ExpireCanceledSubscriptionsService());
    const trialEmails = await run("trial-emails", () => SendTrialEmailsService());
    const weekly = await run("weekly-digest", () => SendWeeklyDigestService());
    return sendSuccess(
      res,
      { notificationsCreated: notifications?.created, riskNotificationsCreated: risk?.created, riskEmailsSent: risk?.emailed, trashPurged: purged, storageRetried: retried, storageSwept: swept, commissions, subscriptions, trialEmails, weeklyEmailsSent: weekly?.emailed },
      "Daily jobs finished",
    );
  });
}
