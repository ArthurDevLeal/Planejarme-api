import { Router } from "express";
import { AuthController } from "../controllers/auth-controller";

const authRouter = Router();
const controller = new AuthController();

authRouter.post("/signin", controller.SingIn);

export { authRouter };
