import { Router } from "express";
import { UserController } from "../controllers/user-controller";

const userRouter = Router();
const controller = new UserController();

userRouter.get("/:userId/dashboard", controller.GetUserDashboard);
userRouter.get("/:id", controller.GetUserById);
userRouter.post("/", controller.CreateUser);
userRouter.put("/:id", controller.UpdateUser);
userRouter.delete("/:id", controller.DeleteUser);

export { userRouter };
