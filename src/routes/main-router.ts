import { Router } from "express";
import { authRouter } from "./auth-router";
import { disciplineRouter } from "./discipline-router";
import { evaluationRouter } from "./evaluation-router";
import { inboxItemRouter } from "./inbox-item-router";
import { materialRouter } from "./material-router";
import { notificationRouter } from "./notification-router";
import { scheduleRouter } from "./schedule-router";
import { taskRouter } from "./task-router";
import { userRouter } from "./user-router";

const mainRouter = Router();

mainRouter.use("/auth", authRouter);
mainRouter.use("/users", userRouter);
mainRouter.use("/disciplines", disciplineRouter);
mainRouter.use("/evaluations", evaluationRouter);
mainRouter.use("/schedules", scheduleRouter);
mainRouter.use("/materials", materialRouter);
mainRouter.use("/tasks", taskRouter);
mainRouter.use("/inbox-items", inboxItemRouter);
mainRouter.use("/notifications", notificationRouter);

export { mainRouter };
