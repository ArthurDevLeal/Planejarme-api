import { Router } from "express";
import { authRouter } from "./auth-router.ts";
import { disciplineRouter } from "./discipline-router.ts";
import { evaluationRouter } from "./evaluation-router.ts";
import { inboxItemRouter } from "./inbox-item-router.ts";
import { materialRouter } from "./material-router.ts";
import { notificationRouter } from "./notification-router.ts";
import { scheduleRouter } from "./schedule-router.ts";
import { taskRouter } from "./task-router.ts";
import { userRouter } from "./user-router.ts";

import { semesterRouter } from "./semester-router.ts";
import { adminRouter, affiliateRouter, billingRouter } from "./billing-router.ts";
import { cronRouter } from "./cron-router.ts";
import { GetPublicPlansService } from "../services/billing-service.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { trashRouter } from "./trash-router.ts";
import { folderRouter } from "./folder-router.ts";
import { publicShareRouter, shareRouter } from "./share-router.ts";

const mainRouter = Router();

mainRouter.use("/auth", authRouter);
mainRouter.use("/users", userRouter);
mainRouter.use("/semesters", semesterRouter);
mainRouter.use("/disciplines", disciplineRouter);
mainRouter.use("/evaluations", evaluationRouter);
mainRouter.use("/schedules", scheduleRouter);
mainRouter.use("/materials", materialRouter);
mainRouter.use("/tasks", taskRouter);
mainRouter.use("/inbox-items", inboxItemRouter);
mainRouter.use("/notifications", notificationRouter);
mainRouter.use("/trash", trashRouter);
mainRouter.use("/folders", folderRouter);
mainRouter.use("/shares", shareRouter);
mainRouter.use("/public/shares", publicShareRouter);
// Sem login: a landing lê preços e limites daqui para não repetir números.
mainRouter.get("/public/plans", (_req, res) => sendSuccess(res, GetPublicPlansService()));
mainRouter.use("/billing", billingRouter);
mainRouter.use("/affiliates", affiliateRouter);
mainRouter.use("/admin", adminRouter);
mainRouter.use("/cron", cronRouter);

export { mainRouter };
