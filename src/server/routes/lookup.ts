import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../services/auth";
import { getItem } from "../services/ebayClient";
import { matchListing } from "../services/matcher";
import { pool } from "../db/pool";
import { getUsdToGbpRate } from "../services/exchangeRate";
import { calculateProfit } from "../services/pricing";

const router = Router();

const schema = z.object({ ebayUrl: z.string().url() });

const extractItemId = (url: string) => {
  const match = url.match(/\/(\d{9,})/);
  return match?.[1] ?? null;
};

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    const itemId = extractItemId(parsed.data.ebayUrl);
    if (!itemId) {
      res.status(400).json({ error: "invalid_ebay_url" });
      return;
    }
    const listing = await getItem(itemId);
    const match = await matchListing(listing.title, listing.itemSpecifics);
    if (!match) {
      res.status(404).json({ error: "no_match" });
      return;
    }
    const card = await pool.query(
      `SELECT c.*, e.name as expansion_name, e.code, e.series, e.release_date, e.logo_url
       FROM cards c
       JOIN expansions e ON c.expansion_id = e.id
       WHERE c.id=$1`,
      [match.cardId]
    );
    if (card.rows.length === 0) {
      res.status(404).json({ error: "card_not_found" });
      return;
    }
    const fx = await getUsdToGbpRate();
    const marketGbp = Number(card.rows[0].market_price_usd) * fx;
    const toGbp = (value: number, currency: string) => {
      if (currency === "GBP") return value;
      if (currency === "USD") return value * fx;
      throw new Error(`Unsupported currency: ${currency}`);
    };
    const price = toGbp(Number(listing.price.value), listing.price.currency ?? "GBP");
    const shipping = listing.shipping ? toGbp(Number(listing.shipping.value), listing.shipping.currency ?? "GBP") : 0;
    const pricing = calculateProfit(price, shipping, marketGbp);
    res.json({
      listing,
      card: card.rows[0],
      match,
      pricing,
      fx
    });
  } catch (error) {
    next(error);
  }
});

export default router;
