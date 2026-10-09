import cors from "cors";
import express, { urlencoded } from "express";
import { ErrorMiddleware } from "./middlewares/errors";
import { mainRouter } from "./routes/main-router";
import { NotFoundException } from "./exceptions/not-found";
import { ErrorCode } from "./exceptions/root";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(
  cors({
    allowedHeaders: ["Content-Type", "Authorization"],
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  }),
);
app.use(urlencoded({ extended: true }));

app.use(mainRouter);

app.get("/", (req, res) => {
  res.json({ message: "hello world" });
});

app.use((req, res, next) => {
  next(new NotFoundException("A rota solicitada não existe. Confira o endereço e o método da solicitação.", ErrorCode.ROUTE_NOT_FOUND));
});

app.use(ErrorMiddleware);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
