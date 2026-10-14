import { AuthMiddleware } from "../middlewares/auth.ts";
import { Router } from "express";
import { UserController } from "../controllers/user-controller.ts";

const userRouter = Router();
const controller = new UserController();

userRouter.post("/", controller.CreateUser);
userRouter.use(AuthMiddleware);
userRouter.get("/me/dashboard", controller.GetCurrentUserDashboard);

userRouter.get("/:userId/dashboard", controller.GetUserDashboard);
userRouter.get("/:id", controller.GetUserById);
userRouter.put("/:id", controller.UpdateUser);
userRouter.delete("/:id", controller.DeleteUser);

export { userRouter };
