import { Router } from "express";
import { NotificationController } from "../controllers/notification-controller.ts";

const notificationRouter = Router();
const controller = new NotificationController();

notificationRouter.get("/user/:userId/unread", controller.GetUnreadNotificationsByUser);
notificationRouter.get("/user/:userId", controller.GetNotificationsByUser);
notificationRouter.get("/:id", controller.GetNotificationById);
notificationRouter.post("/", controller.CreateNotification);
notificationRouter.patch("/:id/read", controller.MarkNotificationAsRead);
notificationRouter.put("/:id", controller.UpdateNotification);
notificationRouter.delete("/:id", controller.DeleteNotification);

export { notificationRouter };
