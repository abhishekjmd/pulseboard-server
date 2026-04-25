import { Router } from "express";
import { createWorkspace, getWorkspaces } from "../controllers/workspace/workspace.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();
router.post("/", protect, createWorkspace);
router.get("/",protect,getWorkspaces);
export default router;

