import { Router } from "express";
import { AuthMiddleware } from "../middlewares/auth";
import { SemesterController } from "../controllers/semester-controller";

const semesterRouter = Router();
const controller = new SemesterController();
semesterRouter.use(AuthMiddleware);

semesterRouter.get("/user/:userId", controller.GetSemestersByUser);
semesterRouter.get("/:id", controller.GetSemesterById);
semesterRouter.post("/", controller.CreateSemester);
semesterRouter.put("/:id", controller.UpdateSemester);
semesterRouter.patch("/:id/current", controller.SetCurrentSemester);
semesterRouter.delete("/:id", controller.DeleteSemester);

export { semesterRouter };
