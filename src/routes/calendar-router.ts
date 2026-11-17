import { Router } from "express";
import { CalendarController } from "../controllers/calendar-controller.ts";
import { RateLimit } from "../middlewares/rate-limit.ts";

const publicCalendarRouter = Router();
// Por token, não por IP: Google e Outlook buscam de IPs compartilhados.
const perToken = RateLimit({ windowMs: 60_000, max: 30, key: (req) => String(req.params.token) });
publicCalendarRouter.get("/:token.ics", perToken, new CalendarController().ReadPublic);

export { publicCalendarRouter };
