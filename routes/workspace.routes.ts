import { Router } from "express";
import {
  createWorkspace,
  getWorkspaceById,
  getWorkspaceRepos,
  getWorkspaces,
  inviteUser,
} from "../controllers/workspace/workspace.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();
router.post("/", protect, createWorkspace);
router.get("/", protect, getWorkspaces);
router.get("/:id", protect, getWorkspaceById);
router.get("/:id/repos", protect, getWorkspaceRepos);
router.post("/:id/invite", protect, inviteUser);
export default router;
