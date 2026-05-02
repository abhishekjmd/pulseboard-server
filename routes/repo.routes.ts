import { Router } from "express";
import {
  connectRepo,
  getRepoAnalytics,
  getRepoCommits,
  getRepoContributors,
  syncCommits,
} from "../controllers/repo/repo.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ message: "Repo route working" });
});

router.post("/", protect, connectRepo);
router.post("/connect", protect, connectRepo);
router.post("/:id/sync-commits", protect, syncCommits);
router.get("/:id/commits", protect, getRepoCommits);
router.get("/:id/analytics", protect, getRepoAnalytics);
router.get("/:id/contributors", protect, getRepoContributors);

export default router;
