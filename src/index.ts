import express, { urlencoded } from "express";
import { ErrorMiddleware } from "./middlewares/errors";
import { mainRouter } from "./routes/main-router";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(urlencoded({ extended: true }));

app.use(mainRouter);

app.use(ErrorMiddleware);

app.get("/", (req, res) => {
  res.json({ message: "hello world" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
