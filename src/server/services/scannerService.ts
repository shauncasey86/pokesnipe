import { pool } from "../db/pool";
import { searchItems } from "./ebayClient";
import { matchListing } from "./matcher";
import { getUsdToGbpRate } from "./exchangeRate";
import { calculateProfit } from "./pricing";
import { v4 as uuidv4 } from "uuid";

const QUERY_SET = [
  "pokemon card PSA",
  "pokemon card lot",
  "pokemon tcg alt art",
  "pokemon tcg promo"
];

const toGbp = (value: number, currency: string, fx: number) => {
  if (currency === "GBP") return value;
  if (currency === "USD") return value * fx;
  throw new Error(`Unsupported currency: ${currency}`);
};

export const scanEbay = async () => {
  const fx = await getUsdToGbpRate();
  for (const query of QUERY_SET) {
    const listings = await searchItems(query, 25);
    for (const listing of listings) {
      const existing = await pool.query("SELECT 1 FROM deals WHERE ebay_item_id=$1", [listing.itemId]);
      if (existing.rows.length > 0) continue;
      const match = await matchListing(listing.title, listing.itemSpecifics);
      if (!match) continue;
      const card = await pool.query(
        `SELECT c.id, c.name, c.card_number, c.printed_total, c.image_url, c.market_price_usd, e.name as expansion_name, e.code
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
      const liquidity = pricing.profitPct > 25 ? "high" : pricing.profitPct > 10 ? "med" : "low";
      const tier = pricing.profitPct >= 40 && liquidity === "high" ? "grail"
        : pricing.profitPct >= 25 ? "hit"
        : pricing.profitPct >= 15 ? "flip"
        : "sleeper";
      const dealId = uuidv4();
      await pool.query(
        `INSERT INTO deals (id, event_id, card_id, ebay_item_id, ebay_url, ebay_title, ebay_image, ebay_price_gbp, ebay_shipping_gbp,
         market_price_usd, fx_rate, profit_gbp, profit_pct, confidence, liquidity, condition, tier, pricing_breakdown, match_details, created_at)
         VALUES ($1, nextval('deal_event_id_seq'), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now())`,
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
          { confidence: match.confidence, breakdown: match.confidenceBreakdown, extracted: match.extracted }
        ]
      );
    }
  }
};
