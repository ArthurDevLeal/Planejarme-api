import { Router } from "express";
import { FlashcardController } from "../controllers/flashcard-controller.ts";
import { AuthMiddleware } from "../middlewares/auth.ts";

const flashcardRouter = Router();
const controller = new FlashcardController();
flashcardRouter.use(AuthMiddleware);

flashcardRouter.post("/decks", controller.CreateDeck);
flashcardRouter.get("/decks", controller.ListDecks);
flashcardRouter.get("/decks/:id", controller.GetDeck);
flashcardRouter.get("/decks/:id/study", controller.StudyDeck);
flashcardRouter.delete("/decks/:id", controller.DeleteDeck);
flashcardRouter.post("/cards/:id/review", controller.ReviewCard);

export { flashcardRouter };
