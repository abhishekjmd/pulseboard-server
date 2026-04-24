import "dotenv/config";
import express from "express";
import errorHandler from "./utils/errorHandler";
import authRoutes from "./routes/auth.routes";
import workspaceRoutes from "./routes/workspace.routes";
// rest of your code...
const app = express();
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/workspaces", workspaceRoutes);

app.use(errorHandler);

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
