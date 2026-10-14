import { Router } from "express";
import multer from "multer";
import { MaterialController } from "../controllers/material-controller";
import { AuthMiddleware } from "../middlewares/auth";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const materialRouter = Router();
const controller = new MaterialController();

materialRouter.use((req, res, next) => {
  if (req.headers.authorization) {
    return AuthMiddleware(req, res, next);
  }
  next();
});

materialRouter.get("/user/:userId", controller.GetMaterialsByUser);
materialRouter.get("/discipline/:disciplineId", controller.GetMaterialsByDiscipline);
materialRouter.get("/:id/download-url", controller.GetMaterialDownloadUrl);
materialRouter.get("/:id", controller.GetMaterialById);
materialRouter.post("/upload", upload.single("file"), controller.UploadMaterial);
materialRouter.post("/", controller.CreateMaterial);
materialRouter.put("/:id", controller.UpdateMaterial);
materialRouter.delete("/:id", controller.DeleteMaterial);

export { materialRouter };
