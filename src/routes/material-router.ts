import { Router } from "express";
import multer from "multer";
import { MaterialController } from "../controllers/material-controller.ts";
import { AuthMiddleware } from "../middlewares/auth.ts";
import { BadRequestsException } from "../exceptions/bad-requests.ts";
import { ErrorCode } from "../exceptions/root.ts";

const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx", ".xlsx", ".pptx", ".txt"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const name = file.originalname.toLowerCase();
    if (ALLOWED_EXTENSIONS.some((extension) => name.endsWith(extension))) return callback(null, true);
    callback(
      new BadRequestsException(
        "Tipo de arquivo não aceito. Envie PDF, imagem (PNG/JPG), Word, Excel, PowerPoint ou TXT, ou salve um link.",
        ErrorCode.INVALID_DATA,
      ),
    );
  },
});

const materialRouter = Router();
const controller = new MaterialController();

materialRouter.use(AuthMiddleware);

materialRouter.get("/user/:userId", controller.GetMaterialsByUser);
materialRouter.get("/discipline/:disciplineId", controller.GetMaterialsByDiscipline);
materialRouter.get("/task/:taskId", controller.GetMaterialsByTask);
materialRouter.get("/:id/download-url", controller.GetMaterialDownloadUrl);
materialRouter.get("/:id", controller.GetMaterialById);
materialRouter.post("/upload", upload.single("file"), controller.UploadMaterial);
materialRouter.post("/", controller.CreateMaterial);
materialRouter.put("/:id", controller.UpdateMaterial);
materialRouter.delete("/:id", controller.DeleteMaterial);

export { materialRouter };
