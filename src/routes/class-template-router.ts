import { Router } from "express";
import { ClassTemplateController } from "../controllers/class-template-controller.ts";
import { AuthMiddleware } from "../middlewares/auth.ts";
import { RateLimit } from "../middlewares/rate-limit.ts";

const controller = new ClassTemplateController();

const publicClassRouter = Router();
publicClassRouter.use(RateLimit({ windowMs: 60_000, max: 120 }));
publicClassRouter.get("/:token", controller.Preview);

const classRouter = Router();
classRouter.use(AuthMiddleware);
classRouter.post("/:token/import", RateLimit({ windowMs: 60 * 60_000, max: 30 }), controller.Import);

export { classRouter, publicClassRouter };
