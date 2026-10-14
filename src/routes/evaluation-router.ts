import { AuthMiddleware } from "../middlewares/auth";
import { Router } from "express";
import { EvaluationController } from "../controllers/evaluation-controller";

const evaluationRouter = Router();
const controller = new EvaluationController();
evaluationRouter.use(AuthMiddleware);

evaluationRouter.get("/discipline/:disciplineId/summary", controller.GetEvaluationSummary);
evaluationRouter.get("/discipline/:disciplineId", controller.GetEvaluationsByDiscipline);
evaluationRouter.get("/:id", controller.GetEvaluationById);
evaluationRouter.post("/", controller.CreateEvaluation);
evaluationRouter.put("/:id", controller.UpdateEvaluation);
evaluationRouter.delete("/:id", controller.DeleteEvaluation);

export { evaluationRouter };
