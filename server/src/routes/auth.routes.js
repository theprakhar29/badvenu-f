import { Router } from "express";
import { signup, login, logout, me } from "../controllers/auth.controller.js";
import { requireOrganizer } from "../middleware/auth.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireOrganizer, me);

export default router;
