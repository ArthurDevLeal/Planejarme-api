import { Router } from "express";
import { QuizController } from "../controllers/quiz-controller.ts";
import { AuthMiddleware } from "../middlewares/auth.ts";

const quizRouter = Router();
const controller = new QuizController();
quizRouter.use(AuthMiddleware);

quizRouter.post("/", controller.CreateQuiz);
quizRouter.get("/", controller.ListQuizzes);
quizRouter.get("/:id", controller.GetQuiz);
quizRouter.patch("/:id/answers", controller.SubmitAnswers);
quizRouter.post("/:id/retry", controller.RetryQuiz);

export { quizRouter };
