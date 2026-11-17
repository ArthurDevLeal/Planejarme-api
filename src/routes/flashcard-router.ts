import { Router } from "express";
import { FlashcardController } from "../controllers/flashcard-controller.ts";
import { AuthMiddleware } from "../middlewares/auth.ts";
import { RateLimit } from "../middlewares/rate-limit.ts";

const flashcardRouter = Router();
const controller = new FlashcardController();
flashcardRouter.use(AuthMiddleware);

flashcardRouter.post("/decks", RateLimit({ windowMs: 15 * 60_000, max: process.env.RUN_DB_TESTS === "1" ? 1000 : 5 }), controller.CreateDeck);
flashcardRouter.get("/decks", controller.ListDecks);
flashcardRouter.get("/decks/:id", controller.GetDeck);
flashcardRouter.get("/decks/:id/study", controller.StudyDeck);
flashcardRouter.delete("/decks/:id", controller.DeleteDeck);
flashcardRouter.post("/cards/:id/review", controller.ReviewCard);

export { flashcardRouter };
