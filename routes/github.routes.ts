import { Router } from "express";
import {
  getGitHubConnection,
  handleGitHubOAuthCallback,
  startGitHubOAuth,
  listGitHubRepositories,
} from "../controllers/github.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

router.get("/oauth/start", protect, startGitHubOAuth);
router.get("/oauth/callback", handleGitHubOAuthCallback);
router.get("/connection", protect, getGitHubConnection);
router.get("/repositories", protect, listGitHubRepositories);

export default router;