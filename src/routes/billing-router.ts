import { Router } from "express";
import { AdminMiddleware, AffiliateController, BillingController } from "../controllers/billing-controller.ts";
import { AuthMiddleware } from "../middlewares/auth.ts";
import { RateLimit } from "../middlewares/rate-limit.ts";

const billing = new BillingController();
const affiliates = new AffiliateController();

const billingRouter = Router();
billingRouter.use(AuthMiddleware);
billingRouter.get("/me", billing.Me);
billingRouter.post("/checkout", RateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), billing.Checkout);
billingRouter.post("/cancel", RateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), billing.Cancel);

const affiliateRouter = Router();
affiliateRouter.use(AuthMiddleware);
affiliateRouter.get("/me", affiliates.Me);
affiliateRouter.post("/join", affiliates.Join);

const adminRouter = Router();
adminRouter.use(AuthMiddleware, AdminMiddleware);
adminRouter.get("/affiliates", affiliates.AdminAffiliates);
adminRouter.post("/affiliates/:id/block", affiliates.AdminBlock);
adminRouter.post("/affiliates/:id/unblock", affiliates.AdminUnblock);
adminRouter.get("/commissions", affiliates.AdminCommissions);
adminRouter.post("/commissions/:id/pay", affiliates.AdminPay);
adminRouter.post("/commissions/:id/cancel", affiliates.AdminCancel);

export { adminRouter, affiliateRouter, billingRouter, billing as billingController };
