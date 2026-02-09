import { Router } from "express";
import { requireAuth } from "../services/auth.js";
import { getStatus } from "../services/statusService.js";

const router = Router();

router.get("/", requireAuth, async (_req, res, next) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
});

export default router;
