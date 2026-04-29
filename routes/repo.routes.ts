import { Router } from "express";
import { connectRepo, getRepoCommits } from "../controllers/repo/repo.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

router.post("/connect", protect, connectRepo);
router.get("/:id/commits", protect, getRepoCommits);

export default router;
