import { pool } from "../db/pool.js";
import { searchItems } from "./ebayClient.js";
import { matchListing } from "./matcher.js";
import { getUsdToGbpRate } from "./exchangeRate.js";
import { calculateProfit } from "./pricing.js";
import { v4 as uuidv4 } from "uuid";

const QUERY_SET = [
  "pokemon tcg single card holo",
  "pokemon tcg single card V VMAX",
  "pokemon tcg single card ex",
  "pokemon tcg alt art single",
  "pokemon tcg illustration rare",
  "pokemon tcg gold card single",
  "pokemon card charizard single",
  "pokemon card promo single",
];

// Reject listings that are clearly lots, bundles, or bulk
const BULK_PATTERNS = /\b(lot|bundle|collection|choose|pick|select|random|mystery|grab bag|bulk|set of|x\d{2,}|\d{2,}\s*cards|\d{2,}\s*card\s*lot|wholesale|mixed|assorted|binder|starter kit)\b/i;

const toGbp = (value: number, currency: string, fx: number) => {
  if (currency === "GBP") return value;
  if (currency === "USD") return value * fx;
  throw new Error(`Unsupported currency: ${currency}`);
};

// Derive comps from card prices JSONB (synced from Scrydex)
const deriveComps = (prices: Record<string, number | null> | null): Record<string, number | null> | null => {
  if (!prices) return null;
  // Scrydex price keys: normal.market, reverseHolofoil.market, holofoil.market, etc.
  // Map to condition grades using available price data
  const market = prices.market ?? prices["normal.market"] ?? null;
  if (market == null) return null;
  return {
    NM: market,
    LP: market != null ? Math.round(market * 0.85 * 100) / 100 : null,
    MP: market != null ? Math.round(market * 0.62 * 100) / 100 : null,
    HP: market != null ? Math.round(market * 0.40 * 100) / 100 : null
  };
};

// Compute liquidity breakdown signals from available data
const deriveLiquidityBreakdown = (
  profitPct: number,
  marketPriceUsd: number,
  confidence: number,
  prices: Record<string, number | null> | null
) => {
  // Trend: higher market price suggests more liquid
  const trend = Math.min(1, marketPriceUsd / 100);
  // Prices: do we have price data available
  const pricesSignal = prices && Object.values(prices).filter(v => v != null).length > 0 ? 0.9 : 0.3;
  // Spread: inverse of profit spread (higher margins can mean wider spread)
  const spread = Math.max(0, Math.min(1, 1 - profitPct / 100));
  // Supply: heuristic from market price (higher price = generally less supply)
  const supply = Math.min(1, Math.max(0.2, 1 - marketPriceUsd / 200));
  // Sold: proxy from confidence (well-matched cards = more recognizable = more sold)
  const sold = Math.min(1, confidence * 1.1);
  // Velocity: null by default (fetched async from Scrydex on demand)
  return { Trend: trend, Prices: pricesSignal, Spread: spread, Supply: supply, Sold: sold, Velocity: null as number | null };
};

// Compute scalar liquidity from breakdown
const computeLiquidity = (breakdown: Record<string, number | null>): string => {
  const values = Object.values(breakdown).filter((v): v is number => v != null);
  if (values.length === 0) return "low";
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return avg >= 0.7 ? "high" : avg >= 0.45 ? "med" : "low";
};

export const scanEbay = async () => {
  const fx = await getUsdToGbpRate();
  for (const query of QUERY_SET) {
    // 183454 = eBay category "CCG Individual Cards" — excludes lots, sealed, bundles
    const listings = await searchItems(query, 25, "183454");
    for (const listing of listings) {
      // Skip bulk/lot/bundle listings
      if (BULK_PATTERNS.test(listing.title)) continue;
      const existing = await pool.query("SELECT 1 FROM deals WHERE ebay_item_id=$1", [listing.itemId]);
      if (existing.rows.length > 0) continue;
      const match = await matchListing(listing.title, listing.itemSpecifics);
      if (!match) continue;
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
      if (!c.market_price_usd) continue;
      const price = toGbp(Number(listing.price.value), listing.price.currency ?? "GBP", fx);
      const shipping = listing.shipping ? toGbp(Number(listing.shipping.value), listing.shipping.currency ?? "GBP", fx) : 0;
      const marketGbp = Number(c.market_price_usd) * fx;
      const pricing = calculateProfit(price, shipping, marketGbp);

      // Compute liquidity breakdown instead of simple scalar
      const liqBreakdown = deriveLiquidityBreakdown(pricing.profitPct, Number(c.market_price_usd), match.confidence, c.prices);
      const liquidity = computeLiquidity(liqBreakdown);

      // Derive comps by condition from card prices
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
    }
  }
};
