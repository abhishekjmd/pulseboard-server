import { Router } from "express";
import {
  connectRepo,
  connectRepoFromGithub,
  getRepoSyncStatus,
  getRepoAnalytics,
  getRepoById,
  getRepoCommits,
  getRepoContributors,
  getRepoContributions,
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
router.get("/:id/contributions", optionalProtect, getRepoContributions);
router.get("/:id/sync-status", optionalProtect, getRepoSyncStatus);
router.post("/:id/sync-commits", optionalProtect, syncCommits);
router.post("/:id/sync-prs", optionalProtect, syncPullRequests);

// Protected routes (creation)
router.post("/", protect, connectRepo);
router.post("/connect", protect, connectRepo);
router.post("/from-github", protect, connectRepoFromGithub);

export default router;
