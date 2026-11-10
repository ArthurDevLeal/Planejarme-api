import { Router } from "express";
import { MaterialController } from "../controllers/material-controller.ts";
import { AuthMiddleware } from "../middlewares/auth.ts";

const materialRouter = Router();
const controller = new MaterialController();

materialRouter.use(AuthMiddleware);

materialRouter.get("/user/:userId", controller.GetMaterialsByUser);
materialRouter.get("/discipline/:disciplineId", controller.GetMaterialsByDiscipline);
materialRouter.get("/task/:taskId", controller.GetMaterialsByTask);
materialRouter.get("/:id/download-url", controller.GetMaterialDownloadUrl);
materialRouter.get("/:id", controller.GetMaterialById);
// O arquivo vai direto ao Storage pela URL assinada; /upload só confirma e registra o que chegou lá.
materialRouter.post("/upload-url", controller.CreateUploadUrl);
materialRouter.post("/upload", controller.UploadMaterial);
materialRouter.post("/", controller.CreateMaterial);
materialRouter.put("/:id", controller.UpdateMaterial);
materialRouter.delete("/:id", controller.DeleteMaterial);

export { materialRouter };
