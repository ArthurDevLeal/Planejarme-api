import { Router } from "express";
import { CronController } from "../controllers/cron-controller.ts";

const cronRouter = Router();
const controller = new CronController();

// Chamado pela Vercel Cron (vercel.json) com Authorization: Bearer CRON_SECRET.
cronRouter.get("/daily", controller.Daily);

export { cronRouter };
