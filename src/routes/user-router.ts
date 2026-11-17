import { AuthMiddleware } from "../middlewares/auth.ts";
import { Router } from "express";
import { UserController } from "../controllers/user-controller.ts";
import { RateLimit } from "../middlewares/rate-limit.ts";
import { CalendarController } from "../controllers/calendar-controller.ts";

const userRouter = Router();
const controller = new UserController();
const calendar = new CalendarController();

userRouter.post("/", RateLimit({ windowMs: 60 * 60 * 1000, max: 10 }), controller.CreateUser);
userRouter.use(AuthMiddleware);
userRouter.get("/me/dashboard", controller.GetCurrentUserDashboard);
userRouter.get("/me/context", controller.GetCurrentUserContext);
userRouter.get("/me/disciplines", controller.GetCurrentUserDisciplines);
userRouter.get("/me/tasks", controller.GetCurrentUserTasks);
userRouter.get("/me/usage", controller.GetCurrentUserUsage);
userRouter.patch("/me/password", controller.UpdatePassword);
userRouter.get("/me/export", controller.ExportCurrentUserData);
userRouter.get("/me/calendar", calendar.Get);
userRouter.post("/me/calendar", calendar.Rotate);
userRouter.delete("/me/calendar", calendar.Revoke);

userRouter.get("/:userId/dashboard", controller.GetUserDashboard);
userRouter.get("/:id", controller.GetUserById);
userRouter.put("/:id", controller.UpdateUser);
userRouter.delete("/:id", controller.DeleteUser);

export { userRouter };
