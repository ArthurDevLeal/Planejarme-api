import { Router } from "express";
import { InboxItemController } from "../controllers/inbox-item-controller";

const inboxItemRouter = Router();
const controller = new InboxItemController();

inboxItemRouter.get("/user/:userId", controller.GetInboxItemsByUser);
inboxItemRouter.get("/:id", controller.GetInboxItemById);
inboxItemRouter.post("/", controller.CreateInboxItem);
inboxItemRouter.put("/:id", controller.UpdateInboxItem);
inboxItemRouter.delete("/:id", controller.DeleteInboxItem);

export { inboxItemRouter };
