import { AuthMiddleware } from "../middlewares/auth.ts";
import { Router } from "express";
import { DisciplineController } from "../controllers/discipline-controller.ts";
import { ClassTemplateController } from "../controllers/class-template-controller.ts";

const disciplineRouter = Router();
const controller = new DisciplineController();
const classTemplate = new ClassTemplateController();
disciplineRouter.use(AuthMiddleware);

// Link da turma: grátis, fora do ProOnlyWrites.
disciplineRouter.get("/:id/class-template", classTemplate.Get);
disciplineRouter.post("/:id/class-template", classTemplate.Create);
disciplineRouter.delete("/:id/class-template", classTemplate.Revoke);

disciplineRouter.get("/user/:userId", controller.GetDisciplinesByUser);
disciplineRouter.get("/:id/status", controller.GetDisciplineStatus);
disciplineRouter.get("/:id", controller.GetDisciplineById);
disciplineRouter.post("/", controller.CreateDiscipline);
disciplineRouter.put("/:id", controller.UpdateDiscipline);
disciplineRouter.delete("/:id", controller.DeleteDiscipline);

export { disciplineRouter };
