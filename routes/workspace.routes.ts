import { Router } from "express";
import { createWorkspace } from "../controllers/workspace/workspace.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();
router.post("/", protect, createWorkspace);
export default router;
