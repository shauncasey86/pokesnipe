import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../services/auth.js";
import { z } from "zod";

const router = Router();

router.get("/", requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT data FROM user_preferences ORDER BY id LIMIT 1");
    res.json(rows[0]?.data ?? {});
  } catch (error) {
    next(error);
  }
});

router.put("/", requireAuth, async (req, res, next) => {
  try {
    const schema = z.record(z.any());
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    await pool.query(
      "INSERT INTO user_preferences (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = user_preferences.data || $1",
      [result.data]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
