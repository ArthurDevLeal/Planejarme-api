import { Router } from "express";
import { DisciplineController } from "../controllers/discipline-controller";

const disciplineRouter = Router();
const controller = new DisciplineController();

disciplineRouter.get("/user/:userId", controller.GetDisciplinesByUser);
disciplineRouter.get("/:id", controller.GetDisciplineById);
disciplineRouter.post("/", controller.CreateDiscipline);
disciplineRouter.put("/:id", controller.UpdateDiscipline);
disciplineRouter.delete("/:id", controller.DeleteDiscipline);

export { disciplineRouter };
