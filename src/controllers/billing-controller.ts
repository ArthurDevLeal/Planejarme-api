import { NextFunction, Request, Response } from "express";
import Stripe from "stripe";
import z from "../schemas/zod.ts";
import { prisma } from "../../lib/prisma.ts";
import { adminEmails } from "../config/billing.ts";
import { BadRequestsException } from "../exceptions/bad-requests.ts";
import { ForbiddenException } from "../exceptions/forbidden.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { ValidationException } from "../exceptions/validation.ts";
import { verifyWebhook } from "../lib/stripe.ts";
import {
  BlockAffiliateService,
  GetAffiliateService,
  JoinAffiliateService,
  ListAffiliatesService,
  ListCommissionsService,
  SettleCommissionService,
  UnblockAffiliateService,
} from "../services/affiliate-service.ts";
import { CreateCheckoutService, CreatePortalService, GetBillingService, HandleStripeEventService } from "../services/billing-service.ts";
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

  Portal = ErrorHandler(async (req: Request, res: Response) => sendSuccess(res, await CreatePortalService(req.userId), "Portal created", 201));

  /** Corpo cru (express.raw em index.ts): a assinatura do Stripe é calculada sobre os bytes exatos. */
  Webhook = ErrorHandler(async (req: Request, res: Response) => {
    let event;
    try {
      event = verifyWebhook(req.body as Buffer, req.headers["stripe-signature"] as string | undefined);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
        throw new BadRequestsException("Assinatura do webhook inválida.", ErrorCode.INVALID_DATA);
      }
      throw error;
    }
    return sendSuccess(res, await HandleStripeEventService(event));
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
