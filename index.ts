import "dotenv/config";
import express, { Request, Response } from "express";
import userRoutes from "./routes/user.routes";

// rest of your code...
const app = express();

app.use(express.json());
app.use("/users", userRoutes);

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
