import { Router } from "express";
import {
  createWorkspace,
  getWorkspaceById,
  getWorkspaces,
  inviteUser,
} from "../controllers/workspace/workspace.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();
router.post("/", protect, createWorkspace);
router.get("/", protect, getWorkspaces);
router.get("/:id", protect, getWorkspaceById);
router.post("/:id/invite", protect, inviteUser);
export default router;
