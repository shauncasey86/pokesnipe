import { Router } from "express";
import { requireAuth } from "../services/auth";
import { pool } from "../db/pool";
import { encryptJson } from "../services/crypto";
import { z } from "zod";

const router = Router();

router.get("/api-keys", requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT provider, updated_at FROM api_credentials");
    const response = rows.reduce((acc: Record<string, any>, row: any) => {
      acc[row.provider] = { configured: true, updatedAt: row.updated_at };
      return acc;
    }, {} as Record<string, any>);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.put("/api-keys/:provider", requireAuth, async (req, res, next) => {
  try {
    const provider = req.params.provider;
    const schema = z.record(z.string());
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    const encrypted = encryptJson(parsed.data);
    await pool.query(
      `INSERT INTO api_credentials (provider, encrypted_payload, updated_at)
       VALUES ($1,$2,now())
       ON CONFLICT (provider) DO UPDATE SET encrypted_payload=EXCLUDED.encrypted_payload, updated_at=EXCLUDED.updated_at`,
      [provider, encrypted]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
