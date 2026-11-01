import { Router } from "express";
import { AuthController } from "../controllers/auth-controller.ts";
import { RateLimit } from "../middlewares/rate-limit.ts";

const authRouter = Router();
const controller = new AuthController();

authRouter.post("/signin", RateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), controller.SingIn);

export { authRouter };
