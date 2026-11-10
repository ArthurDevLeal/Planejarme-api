import { Router } from "express";
import { CronController } from "../controllers/cron-controller.ts";

const cronRouter = Router();
const controller = new CronController();

cronRouter.get("/daily", controller.Daily);

export { cronRouter };
