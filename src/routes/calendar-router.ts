import { Router } from "express";
import { CalendarController } from "../controllers/calendar-controller.ts";
import { RateLimit } from "../middlewares/rate-limit.ts";

const publicCalendarRouter = Router();
publicCalendarRouter.use(RateLimit({ windowMs: 60_000, max: 60 }));
publicCalendarRouter.get("/:token.ics", new CalendarController().ReadPublic);

export { publicCalendarRouter };
