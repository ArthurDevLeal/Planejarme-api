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

export { mainRouter };
