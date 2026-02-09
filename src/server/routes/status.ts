import { Router } from "express";
import { requireAuth } from "../services/auth";
import { getStatus } from "../services/statusService";

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
