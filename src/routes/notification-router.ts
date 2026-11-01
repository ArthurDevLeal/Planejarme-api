import { Router } from "express";
import { AuthMiddleware } from "../middlewares/auth.ts";
import { NotificationController } from "../controllers/notification-controller.ts";

const notificationRouter = Router();
const controller = new NotificationController();
notificationRouter.use(AuthMiddleware);

notificationRouter.get("/user/:userId/unread", controller.GetUnreadNotificationsByUser);
notificationRouter.patch("/user/:userId/read-all", controller.MarkAllNotificationsAsRead);
notificationRouter.get("/user/:userId", controller.GetNotificationsByUser);
notificationRouter.get("/:id", controller.GetNotificationById);
notificationRouter.post("/", controller.CreateNotification);
notificationRouter.patch("/:id/read", controller.MarkNotificationAsRead);
notificationRouter.put("/:id", controller.UpdateNotification);
notificationRouter.delete("/:id", controller.DeleteNotification);

export { notificationRouter };
