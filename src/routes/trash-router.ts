import { Router } from "express";
import { TrashController } from "../controllers/trash-controller.ts";
import { AuthMiddleware } from "../middlewares/auth.ts";

const trashRouter = Router();
const controller = new TrashController();
trashRouter.use(AuthMiddleware);

trashRouter.get("/", controller.GetTrash);
trashRouter.patch("/:kind/:id/restore", controller.Restore);
trashRouter.delete("/:kind/:id", controller.DeleteForever);

export { trashRouter };
