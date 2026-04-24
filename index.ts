import "dotenv/config";
import express from "express";
import errorHandler from "./utils/errorHandler";

// rest of your code...
const app = express();

app.use(express.json());
app.use(errorHandler);
app.listen(3000, () => console.log("Server running on http://localhost:3000"));
