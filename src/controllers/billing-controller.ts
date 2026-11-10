import { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import z from "../schemas/zod.ts";
import { prisma } from "../../lib/prisma.ts";
import { adminEmails } from "../config/billing.ts";
import { BadRequestsException } from "../exceptions/bad-requests.ts";
import { ForbiddenException } from "../exceptions/forbidden.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { UnauthorizedException } from "../exceptions/unauthorized.ts";
import { ValidationException } from "../exceptions/validation.ts";
import { verifyWebhook } from "../lib/abacatepay.ts";
import {
  BlockAffiliateService,
  GetAffiliateService,
  JoinAffiliateService,
  ListAffiliatesService,
  ListCommissionsService,
  SettleCommissionService,
  UnblockAffiliateService,
} from "../services/affiliate-service.ts";
import { CancelSubscriptionService, CreateCheckoutService, GetBillingService, HandleAbacateEventService } from "../services/billing-service.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

const CheckoutSchema = z.object({ interval: z.enum(["monthly", "yearly"]) });
const BlockSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const CommissionStatusSchema = z.object({ status: z.enum(["PENDING", "AVAILABLE", "PAID", "CANCELED", "FROZEN"]).optional() });

/** Só e-mails de ADMIN_EMAILS. Guarda o e-mail em res.locals para o histórico das ações. */
export const AdminMiddleware = ErrorHandler(async (req: Request, res: Response, next: NextFunction) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } });
  if (!user || !adminEmails().includes(user.email.toLowerCase())) {
    throw new ForbiddenException("Você não tem permissão para acessar esta área.", ErrorCode.FORBIDDEN);
  }
  res.locals.adminEmail = user.email.toLowerCase();
  next();
});

export class BillingController {
  Me = ErrorHandler(async (req: Request, res: Response) => sendSuccess(res, await GetBillingService(req.userId)));

  Checkout = ErrorHandler(async (req: Request, res: Response) => {
    const result = CheckoutSchema.safeParse(req.body);
    if (!result.success) throw new ValidationException("Escolha o plano mensal ou o anual.", result);
    return sendSuccess(res, await CreateCheckoutService(req.userId, result.data.interval), "Checkout created", 201);
  });

  Cancel = ErrorHandler(async (req: Request, res: Response) => sendSuccess(res, await CancelSubscriptionService(req.userId), "Subscription canceled"));

  /** Corpo cru (express.raw em index.ts): o HMAC da Abacate Pay é calculado sobre os bytes exatos. */
  Webhook = ErrorHandler(async (req: Request, res: Response) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    // 4xx não é reenviado pela Abacate Pay: só para segredo errado ou corpo ilegível, que repetir não resolve.
    if (!verifyWebhook(raw, req.query.webhookSecret, req.header("x-webhook-signature"))) {
      throw new UnauthorizedException("Webhook inválido.", ErrorCode.UNAUTHORIZED);
    }
    let payload: { id?: unknown; event?: unknown; devMode?: unknown; data?: unknown };
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new BadRequestsException("Corpo do webhook inválido.", ErrorCode.INVALID_DATA);
    }
    if (typeof payload?.event !== "string") throw new BadRequestsException("Corpo do webhook inválido.", ErrorCode.INVALID_DATA);
    // As retentativas trazem o mesmo id; sem id, o hash do corpo cumpre o mesmo papel na idempotência.
    const id = typeof payload.id === "string" && payload.id ? payload.id : `body_${crypto.createHash("sha256").update(raw).digest("hex")}`;
    return sendSuccess(res, await HandleAbacateEventService({ id, event: payload.event, devMode: payload.devMode === true, data: payload.data as never }));
  });
}

export class AffiliateController {
  Me = ErrorHandler(async (req: Request, res: Response) => sendSuccess(res, await GetAffiliateService(req.userId)));
  Join = ErrorHandler(async (req: Request, res: Response) => sendSuccess(res, await JoinAffiliateService(req.userId), "Affiliate joined", 201));

  AdminAffiliates = ErrorHandler(async (_req: Request, res: Response) => sendSuccess(res, await ListAffiliatesService()));

  AdminCommissions = ErrorHandler(async (req: Request, res: Response) => {
    const result = CommissionStatusSchema.safeParse(req.query);
    if (!result.success) throw new ValidationException("Filtro de status inválido.", result);
    return sendSuccess(res, await ListCommissionsService(result.data.status));
  });

  AdminBlock = ErrorHandler(async (req: Request, res: Response) => {
    const result = BlockSchema.safeParse(req.body);
    if (!result.success) throw new ValidationException("Informe o motivo do bloqueio.", result);
    await BlockAffiliateService(String(req.params.id), result.data.reason, res.locals.adminEmail);
    return sendSuccess(res, null, "Affiliate blocked");
  });

  AdminUnblock = ErrorHandler(async (req: Request, res: Response) => {
    await UnblockAffiliateService(String(req.params.id), res.locals.adminEmail);
    return sendSuccess(res, null, "Affiliate unblocked");
  });

  AdminPay = ErrorHandler(async (req: Request, res: Response) => {
    await SettleCommissionService(String(req.params.id), "PAID", res.locals.adminEmail);
    return sendSuccess(res, null, "Commission paid");
  });

  AdminCancel = ErrorHandler(async (req: Request, res: Response) => {
    await SettleCommissionService(String(req.params.id), "CANCELED", res.locals.adminEmail);
    return sendSuccess(res, null, "Commission canceled");
  });
}
