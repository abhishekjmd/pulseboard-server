import { Router } from "express";
import { signup } from "../controllers/auth/signup.controller";
import { login } from "../controllers/auth/login.controller";
import { authLimit } from "../utils/authLimit";

const router = Router();

router.post("/signup", authLimit, signup);
router.post("/login", authLimit, login);
