import { Router } from "express";
import { ReviewController } from "../controllers/review-controller.ts";
import { AuthMiddleware } from "../middlewares/auth.ts";

const controller = new ReviewController();

const reviewRouter = Router();
reviewRouter.use(AuthMiddleware);
reviewRouter.get("/", controller.List);
reviewRouter.put("/:evaluationId/:day", controller.SetDone);

export { reviewRouter };
