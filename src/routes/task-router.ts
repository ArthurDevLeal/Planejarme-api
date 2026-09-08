import { Router } from "express";
import { TaskController } from "../controllers/task-controller";

const taskRouter = Router();
const controller = new TaskController();

taskRouter.get("/user/:userId/pending", controller.GetPendingTasksByUser);
taskRouter.get("/user/:userId", controller.GetTasksByUser);
taskRouter.get("/:id", controller.GetTaskById);
taskRouter.post("/", controller.CreateTask);
taskRouter.patch("/:id/complete", controller.CompleteTask);
taskRouter.put("/:id", controller.UpdateTask);
taskRouter.delete("/:id", controller.DeleteTask);

export { taskRouter };
