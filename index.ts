import "dotenv/config";
import express from "express";
import errorHandler from "./utils/errorHandler";
import authRoutes from "./routes/auth.routes";
import workspaceRoutes from "./routes/workspace.routes";
import repoRoutes from "./routes/repo.routes";
import metricsRoutes from "./routes/metrics.routes";
import { runRepoSyncBatch, startRepoSyncJob } from "./jobs/repo-sync.job";
// rest of your code...
const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }

  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/repos", repoRoutes);
app.use("/api/metrics", metricsRoutes);

app.use(errorHandler);

startRepoSyncJob();

setTimeout(() => {
  console.log("[INIT] Running initial sync...");
  runRepoSyncBatch().catch((err) => console.error("[INIT SYNC ERROR]", err));
}, 5000);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
