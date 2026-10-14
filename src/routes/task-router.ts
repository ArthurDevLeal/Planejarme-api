import { AuthMiddleware } from "../middlewares/auth.ts";
import { Router } from "express";
import { TaskController } from "../controllers/task-controller.ts";

const taskRouter = Router();
const controller = new TaskController();
taskRouter.use(AuthMiddleware);

taskRouter.get("/user/:userId/pending", controller.GetPendingTasksByUser);
taskRouter.get("/user/:userId", controller.GetTasksByUser);
taskRouter.get("/:id", controller.GetTaskById);
taskRouter.post("/", controller.CreateTask);
taskRouter.patch("/:id/complete", controller.CompleteTask);
taskRouter.put("/:id", controller.UpdateTask);
taskRouter.delete("/:id", controller.DeleteTask);

export { taskRouter };
