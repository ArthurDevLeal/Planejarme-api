import { Router } from "express";
import { AuthMiddleware } from "../middlewares/auth.ts";
import { ProOnlyWrites } from "../middlewares/pro-only.ts";
import { InboxItemController } from "../controllers/inbox-item-controller.ts";

const inboxItemRouter = Router();
const controller = new InboxItemController();
inboxItemRouter.use(AuthMiddleware, ProOnlyWrites);

inboxItemRouter.get("/user/:userId", controller.GetInboxItemsByUser);
inboxItemRouter.get("/:id", controller.GetInboxItemById);
inboxItemRouter.post("/", controller.CreateInboxItem);
inboxItemRouter.put("/:id", controller.UpdateInboxItem);
inboxItemRouter.delete("/:id", controller.DeleteInboxItem);

export { inboxItemRouter };
