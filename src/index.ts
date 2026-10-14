/// <reference path="./@types/express.d.ts" />

import cors from "cors";
import express, { urlencoded } from "express";
import { NotFoundException } from "./exceptions/not-found";
import { ErrorCode } from "./exceptions/root";
import { ErrorMiddleware } from "./middlewares/errors";
import { mainRouter } from "./routes/main-router";

const app = express();
const PORT = process.env.PORT || 3001;

const corsMiddleware = cors({
  origin: "https://planejarme-web.vercel.app",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
});

app.use(corsMiddleware);

app.use(express.json());
app.use(urlencoded({ extended: true }));

app.use(mainRouter);

app.get("/", (req, res) => {
  res.json({ message: "hello world" });
});

app.use((req, res, next) => {
  next(
    new NotFoundException(
      "A rota solicitada não existe. Confira o endereço e o método da solicitação.",
      ErrorCode.ROUTE_NOT_FOUND,
    ),
  );
});

app.use(ErrorMiddleware);

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;
