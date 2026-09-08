import { Router } from "express";
import { MaterialController } from "../controllers/material-controller";

const materialRouter = Router();
const controller = new MaterialController();

materialRouter.get("/user/:userId", controller.GetMaterialsByUser);
materialRouter.get("/discipline/:disciplineId", controller.GetMaterialsByDiscipline);
materialRouter.get("/:id", controller.GetMaterialById);
materialRouter.post("/", controller.CreateMaterial);
materialRouter.put("/:id", controller.UpdateMaterial);
materialRouter.delete("/:id", controller.DeleteMaterial);

export { materialRouter };
