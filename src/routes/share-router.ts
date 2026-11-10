import { Router } from "express";
import { ShareController } from "../controllers/share-controller.ts";
import { AuthMiddleware } from "../middlewares/auth.ts";
import { ProOnlyWrites } from "../middlewares/pro-only.ts";
import { RateLimit } from "../middlewares/rate-limit.ts";

const controller = new ShareController();

const shareRouter = Router();
shareRouter.use(AuthMiddleware, ProOnlyWrites);
shareRouter.get("/", controller.GetMine);
shareRouter.put("/links", controller.UpsertLink);
shareRouter.delete("/links/:id", controller.RevokeLink);
shareRouter.post("/invites", RateLimit({ windowMs: 60 * 60_000, max: 40 }), controller.CreateInvite);
shareRouter.delete("/invites/:id", controller.RevokeInvite);
shareRouter.get("/received", controller.GetReceived);
shareRouter.delete("/received/:id", controller.LeaveReceived);
shareRouter.get("/received/:id", controller.ReadReceived);
shareRouter.get("/received/:id/files/:materialId", controller.SignReceivedFile);

const publicShareRouter = Router();
publicShareRouter.use(RateLimit({ windowMs: 60_000, max: 120 }));
publicShareRouter.get("/:token", controller.ReadPublic);
publicShareRouter.get("/:token/files/:materialId", controller.SignPublicFile);

export { publicShareRouter, shareRouter };
