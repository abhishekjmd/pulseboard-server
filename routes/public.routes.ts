import { Router } from "express";
import { analyzePublicRepo } from "../controllers/public.controller";

const router = Router();

router.post("/analyze", analyzePublicRepo);

export default router;
