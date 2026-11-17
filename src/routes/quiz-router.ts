import { Router } from "express";
import { QuizController } from "../controllers/quiz-controller.ts";
import { AuthMiddleware } from "../middlewares/auth.ts";
import { RateLimit } from "../middlewares/rate-limit.ts";

const quizRouter = Router();
const controller = new QuizController();
quizRouter.use(AuthMiddleware);

quizRouter.post("/", RateLimit({ windowMs: 15 * 60_000, max: process.env.RUN_DB_TESTS === "1" ? 1000 : 5 }), controller.CreateQuiz);
quizRouter.get("/", controller.ListQuizzes);
quizRouter.get("/:id", controller.GetQuiz);
quizRouter.patch("/:id/answers", controller.SubmitAnswers);
quizRouter.post("/:id/retry", controller.RetryQuiz);

export { quizRouter };
