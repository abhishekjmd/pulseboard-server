import "dotenv/config";
import express from "express";
import errorHandler from "./utils/errorHandler";
import authRoutes from "./routes/auth.routes";
import workspaceRoutes from "./routes/workspace.routes";
import repoRoutes from "./routes/repo.routes";
import { runRepoSyncBatch, startRepoSyncJob } from "./jobs/repo-sync.job";
// rest of your code...
const app = express();
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/repos", repoRoutes);

app.use(errorHandler);

startRepoSyncJob();
void runRepoSyncBatch();

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
