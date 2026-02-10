import { pool } from "../db/pool.js";
import { searchItems } from "./ebayClient.js";
import { matchListing } from "./matcher.js";
import { getUsdToGbpRate } from "./exchangeRate.js";
import { calculateProfit } from "./pricing.js";
import { v4 as uuidv4 } from "uuid";
import { pino } from "pino";

const logger = pino({ name: "scanner" });

// ─── STRATEGY ───────────────────────────────────────────────────────
// Instead of searching for specific cards/sets (which misses deals),
// we monitor the STREAM of all newly listed Pokemon individual cards.
//
// One broad query: "pokemon card" in category 183454 (Individual Cards),
// sorted by newlyListed, with price floor + Buy It Now filter.
//
// Each scan picks up the latest listings. The matcher + price DB decides
// if any are underpriced. This catches ANY card from ANY set.
//
// API budget: ~1 call per scan × 288 scans/day = 288 eBay calls/day
// vs old approach: 8-14 calls per scan = 2000-4000/day
// ─────────────────────────────────────────────────────────────────────

const SEARCH_OPTS = {
  categoryId: "183454",                                    // CCG Individual Cards
  filter: "price:[3..],buyingOptions:{FIXED_PRICE}",       // Min £3, BIN only
  sort: "newlyListed",                                     // Newest first
};

// Reject listings that are lots, bundles, multi-variation "pick" listings, etc.
const BULK_PATTERNS = /\b(lot|bundle|collection|choose\s*(your|a|the)?\s*card|pick\s*(your|a)?\s*card|select\s*(your|a)?\s*card|selection|random|mystery|grab bag|bulk|set of|x\d{2,}|\d{2,}\s*cards|\d{2,}\s*card\s*lot|wholesale|mixed|assorted|binder|starter kit|deck\s+(box|cards|list)|my first battle|all\s+cards\s+available|job\s*lot|singles\s*-|complete\s*(set|your)|custom|any\s*\d+\s*for)\b/i;

const toGbp = (value: number, currency: string, fx: number) => {
  if (currency === "GBP") return value;
  if (currency === "USD") return value * fx;
  return value; // best effort for other currencies
};

// Derive comps from card prices JSONB (synced from Scrydex)
const deriveComps = (prices: Record<string, number | null> | null): Record<string, number | null> | null => {
  if (!prices) return null;
  const market = prices.market ?? prices["normal.market"] ?? null;
  if (market == null) return null;
  return {
    NM: market,
    LP: Math.round(market * 0.85 * 100) / 100,
    MP: Math.round(market * 0.62 * 100) / 100,
    HP: Math.round(market * 0.40 * 100) / 100
  };
};

// Compute liquidity breakdown signals from available data
const deriveLiquidityBreakdown = (
  profitPct: number,
  marketPriceUsd: number,
  confidence: number,
  prices: Record<string, number | null> | null
) => {
  const trend = Math.min(1, marketPriceUsd / 100);
  const pricesSignal = prices && Object.values(prices).filter(v => v != null).length > 0 ? 0.9 : 0.3;
  const spread = Math.max(0, Math.min(1, 1 - profitPct / 100));
  const supply = Math.min(1, Math.max(0.2, 1 - marketPriceUsd / 200));
  const sold = Math.min(1, confidence * 1.1);
  return { Trend: trend, Prices: pricesSignal, Spread: spread, Supply: supply, Sold: sold, Velocity: null as number | null };
};

const computeLiquidity = (breakdown: Record<string, number | null>): string => {
  const values = Object.values(breakdown).filter((v): v is number => v != null);
  if (values.length === 0) return "low";
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return avg >= 0.7 ? "high" : avg >= 0.45 ? "med" : "low";
};

export const scanEbay = async () => {
  const fx = await getUsdToGbpRate();

  // One broad sweep: newest 200 individual Pokemon cards on eBay UK
  const listings = await searchItems("pokemon card", 200, SEARCH_OPTS);

  let skippedBulk = 0;
  let skippedDupe = 0;
  let skippedNoMatch = 0;
  let skippedNoPrice = 0;
  let skippedNoProfit = 0;
  let saved = 0;

  for (const listing of listings) {
    // 1. Reject bulk/lot/multi-variation listings
    if (BULK_PATTERNS.test(listing.title)) { skippedBulk++; continue; }

    // 2. Skip already-seen listings
    const existing = await pool.query("SELECT 1 FROM deals WHERE ebay_item_id=$1", [listing.itemId]);
    if (existing.rows.length > 0) { skippedDupe++; continue; }

    // 3. Try to match against our card database
    const match = await matchListing(listing.title, listing.itemSpecifics);
    if (!match) { skippedNoMatch++; continue; }

    // 4. Look up the matched card
    const card = await pool.query(
      `SELECT c.id, c.name, c.card_number, c.printed_total, c.image_url, c.market_price_usd, c.prices,
              e.name as expansion_name, e.code
       FROM cards c
       JOIN expansions e ON c.expansion_id = e.id
       WHERE c.id=$1`,
      [match.cardId]
    );
    if (card.rows.length === 0) continue;
    const c = card.rows[0];
    if (!c.market_price_usd) { skippedNoPrice++; continue; }

    // 5. Calculate profit
    const price = toGbp(Number(listing.price.value), listing.price.currency ?? "GBP", fx);
    const shipping = listing.shipping ? toGbp(Number(listing.shipping.value), listing.shipping.currency ?? "GBP", fx) : 0;
    const marketGbp = Number(c.market_price_usd) * fx;
    const pricing = calculateProfit(price, shipping, marketGbp);

    // 6. Only save if there's actual profit (>5%)
    if (pricing.profitPct < 5) { skippedNoProfit++; continue; }

    // 7. Compute signals
    const liqBreakdown = deriveLiquidityBreakdown(pricing.profitPct, Number(c.market_price_usd), match.confidence, c.prices);
    const liquidity = computeLiquidity(liqBreakdown);
    const comps = deriveComps(c.prices);

    const tier = pricing.profitPct >= 40 && liquidity === "high" ? "grail"
      : pricing.profitPct >= 25 ? "hit"
      : pricing.profitPct >= 15 ? "flip"
      : "sleeper";

    const dealId = uuidv4();
    await pool.query(
      `INSERT INTO deals (id, event_id, card_id, ebay_item_id, ebay_url, ebay_title, ebay_image, ebay_price_gbp, ebay_shipping_gbp,
       market_price_usd, fx_rate, profit_gbp, profit_pct, confidence, liquidity, condition, tier,
       pricing_breakdown, match_details, comps_by_condition, liquidity_breakdown, created_at)
       VALUES ($1, nextval('deal_event_id_seq'), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, now())`,
      [
        dealId,
        c.id,
        listing.itemId,
        listing.itemWebUrl,
        listing.title,
        listing.image,
        price,
        shipping,
        c.market_price_usd,
        fx,
        pricing.profit,
        pricing.profitPct,
        match.confidence,
        liquidity,
        listing.condition ?? "NM",
        tier,
        pricing,
        { confidence: match.confidence, breakdown: match.confidenceBreakdown, extracted: match.extracted },
        comps,
        liqBreakdown
      ]
    );
    saved++;
  }

  logger.info({
    fetched: listings.length,
    saved,
    skippedBulk,
    skippedDupe,
    skippedNoMatch,
    skippedNoPrice,
    skippedNoProfit
  }, "scan cycle complete");
};
