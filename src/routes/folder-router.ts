import { Router } from "express";
import { FolderController } from "../controllers/folder-controller.ts";
import { AuthMiddleware } from "../middlewares/auth.ts";
import { ProOnlyWrites } from "../middlewares/pro-only.ts";

const folderRouter = Router();
const controller = new FolderController();
folderRouter.use(AuthMiddleware, ProOnlyWrites);

folderRouter.get("/", controller.GetFolders);
folderRouter.post("/", controller.CreateFolder);
folderRouter.put("/:id", controller.RenameFolder);
folderRouter.patch("/:id/move", controller.MoveFolder);
folderRouter.delete("/:id", controller.DeleteFolder);

export { folderRouter };
