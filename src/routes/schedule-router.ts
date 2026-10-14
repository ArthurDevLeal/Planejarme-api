import { AttendanceController } from "../controllers/attendance-controller.ts";
import { AuthMiddleware } from "../middlewares/auth.ts";
import { Router } from "express";
import { ScheduleController } from "../controllers/schedule-controller.ts";

const scheduleRouter = Router();
const controller = new ScheduleController();
scheduleRouter.use(AuthMiddleware);
scheduleRouter.patch("/:id/attendance", new AttendanceController().SetAttendance);
scheduleRouter.patch("/:id/attendance/:date", new AttendanceController().SetAttendance);
scheduleRouter.put("/:id/series", controller.UpdateScheduleSeries);

scheduleRouter.get("/user/:userId", controller.GetSchedulesByUser);
scheduleRouter.get("/discipline/:disciplineId", controller.GetSchedulesByDiscipline);
scheduleRouter.get("/:id", controller.GetScheduleById);
scheduleRouter.post("/", controller.CreateSchedule);
scheduleRouter.put("/:id", controller.UpdateSchedule);
scheduleRouter.delete("/:id", controller.DeleteSchedule);

export { scheduleRouter };
