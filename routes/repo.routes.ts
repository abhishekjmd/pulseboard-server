import { Router } from "express";
import {
  connectRepo,
  getRepoAnalytics,
  getRepoById,
  getRepoCommits,
  getRepoContributors,
  syncCommits,
  syncPullRequests,
} from "../controllers/repo/repo.controller";
import { protect, optionalProtect } from "../middlewares/auth.middleware";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ message: "Repo route working" });
});

// Publicly accessible if repo is in Public Sandbox
router.get("/:id", optionalProtect, getRepoById);
router.get("/:id/commits", optionalProtect, getRepoCommits);
router.get("/:id/analytics", optionalProtect, getRepoAnalytics);
router.get("/:id/contributors", optionalProtect, getRepoContributors);
router.post("/:id/sync-commits", optionalProtect, syncCommits);
router.post("/:id/sync-prs", optionalProtect, syncPullRequests);

// Protected routes (creation)
router.post("/", protect, connectRepo);
router.post("/connect", protect, connectRepo);

export default router;
