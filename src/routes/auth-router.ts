import { Router } from "express";
import { AuthController } from "../controllers/auth-controller.ts";
import { RateLimit } from "../middlewares/rate-limit.ts";
import { OAuthController } from "../controllers/oauth-controller.ts";

const authRouter = Router();
const controller = new AuthController();
const oauth = new OAuthController();

authRouter.post("/signin", RateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), controller.SingIn);
authRouter.post("/forgot-password", RateLimit({ windowMs: 15 * 60 * 1000, max: 5 }), controller.ForgotPassword);
authRouter.post("/reset-password", RateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), controller.ResetPassword);
authRouter.get("/oauth/:provider", RateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), oauth.Start);
authRouter.get("/oauth/:provider/callback", oauth.Callback);

export { authRouter };
