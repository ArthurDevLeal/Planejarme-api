import { Router } from "express";
import { ScheduleController } from "../controllers/schedule-controller";

const scheduleRouter = Router();
const controller = new ScheduleController();

scheduleRouter.get("/user/:userId", controller.GetSchedulesByUser);
scheduleRouter.get("/discipline/:disciplineId", controller.GetSchedulesByDiscipline);
scheduleRouter.get("/:id", controller.GetScheduleById);
scheduleRouter.post("/", controller.CreateSchedule);
scheduleRouter.put("/:id", controller.UpdateSchedule);
scheduleRouter.delete("/:id", controller.DeleteSchedule);

export { scheduleRouter };
