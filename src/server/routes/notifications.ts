import { Router } from "express";
import { requireAuth } from "../services/auth.js";
import { sendTelegramMessage } from "../services/telegram.js";

const router = Router();

router.post("/telegram/test", requireAuth, async (_req, res, next) => {
  try {
    await sendTelegramMessage("PokeSnipe test message: Telegram integration active.");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
