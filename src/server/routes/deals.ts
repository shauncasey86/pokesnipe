import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../services/auth.js";
import { z } from "zod";

const router = Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit ?? 50);
    const page = Number(req.query.page ?? 1);
    const offset = (page - 1) * limit;
    const { rows } = await pool.query(
      `SELECT d.id, d.event_id, d.ebay_url, d.ebay_title, d.ebay_image, d.ebay_price_gbp, d.ebay_shipping_gbp,
              d.market_price_usd, d.fx_rate, d.profit_gbp, d.profit_pct, d.confidence, d.liquidity, d.condition, d.tier,
              d.match_details, d.comps_by_condition, d.liquidity_breakdown,
              d.created_at, c.name as card_name, c.card_number, e.name as expansion_name, e.code
       FROM deals d
       JOIN cards c ON d.card_id = c.id
       JOIN expansions e ON c.expansion_id = e.id
       ORDER BY d.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ deals: rows, pagination: { page, limit, hasMore: rows.length === limit } });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, c.name as card_name, c.card_number, c.printed_total, c.image_url,
              c.rarity, c.supertype, c.subtypes, e.name as expansion_name, e.code, e.series, e.release_date, e.logo_url
       FROM deals d
       JOIN cards c ON d.card_id = c.id
       JOIN expansions e ON c.expansion_id = e.id
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/review", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      isCorrectMatch: z.boolean(),
      incorrectReason: z.string().optional()
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    await pool.query(
      "UPDATE deals SET reviewed_at=now(), review_correct=$2, review_reason=$3 WHERE id=$1",
      [req.params.id, result.data.isCorrectMatch, result.data.incorrectReason ?? null]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
