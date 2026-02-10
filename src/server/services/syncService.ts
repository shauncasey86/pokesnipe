import { pool } from "../db/pool.js";
import { fetchCardsPage, fetchExpansions } from "./scrydexClient.js";
import { pino } from "pino";

const logger = pino({ name: "sync" });

// Extract the best market price from Scrydex card variants
const extractMarketPrice = (card: any): number | null => {
  // Scrydex puts prices in card.variants[].prices[] array
  const variants = card.variants as any[] | undefined;
  if (variants && Array.isArray(variants)) {
    for (const variant of variants) {
      const prices = variant.prices;
      if (Array.isArray(prices)) {
        for (const p of prices) {
          if (p.market != null) return Number(p.market);
          if (p.mid != null) return Number(p.mid);
        }
      } else if (typeof prices === "object" && prices != null) {
        if (prices.market != null) return Number(prices.market);
        if (prices.mid != null) return Number(prices.mid);
      }
    }
  }

  // Fallback: check flat card.prices (older API format)
  const p = card.prices as Record<string, any> | undefined;
  if (p) {
    if (p.market != null) return Number(p.market);
    if (p.tcgplayer_market != null) return Number(p.tcgplayer_market);
    // Check nested variant keys
    for (const key of Object.keys(p)) {
      if (typeof p[key] === "object" && p[key]?.market != null) return Number(p[key].market);
    }
  }

  return null;
};

// Extract image URL from Scrydex card
const extractImage = (card: any): string | null => {
  // Scrydex images is an array: [{ type: "front", small, medium, large }]
  const images = card.images;
  if (Array.isArray(images) && images.length > 0) {
    return images[0].large ?? images[0].medium ?? images[0].small ?? null;
  }
  // Fallback: check if it's an object (older format)
  if (images && typeof images === "object" && !Array.isArray(images)) {
    return images.large ?? images.small ?? null;
  }
  return card.image_url ?? card.imageUrl ?? null;
};

// Build a full prices JSONB from variants for storage
const buildPricesJson = (card: any): Record<string, any> => {
  const result: Record<string, any> = {};
  const variants = card.variants as any[] | undefined;
  if (variants && Array.isArray(variants)) {
    for (const variant of variants) {
      if (Array.isArray(variant.prices) && variant.prices.length > 0) {
        result[variant.name] = variant.prices[0]; // first price entry per variant
      } else if (typeof variant.prices === "object" && variant.prices != null) {
        result[variant.name] = variant.prices;
      }
    }
  }
  // Also merge flat prices if present
  if (card.prices && typeof card.prices === "object") {
    Object.assign(result, card.prices);
  }
  return result;
};

export const runFullSync = async () => {
  const syncId = await pool.query(
    "INSERT INTO sync_log (type, status, started_at) VALUES ('full','running',now()) RETURNING id"
  );
  const logId = syncId.rows[0].id as number;
  try {
    const expansions = await fetchExpansions();
    for (const exp of expansions) {
      await pool.query(
        `INSERT INTO expansions (scrydex_id, name, code, series, release_date, printed_total, logo_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (scrydex_id) DO UPDATE
         SET name=EXCLUDED.name, code=EXCLUDED.code, series=EXCLUDED.series, release_date=EXCLUDED.release_date,
             printed_total=EXCLUDED.printed_total, logo_url=EXCLUDED.logo_url`,
        [exp.id, exp.name, exp.code, exp.series, exp.releaseDate, exp.printedTotal, exp.logoUrl]
      );
    }

    // Build expansion lookup map for fast resolution
    const expLookup = new Map<string, number>();
    const { rows: expRows } = await pool.query("SELECT id, scrydex_id FROM expansions");
    for (const row of expRows) expLookup.set(row.scrydex_id, row.id);

    // Process cards page-by-page to avoid memory issues
    let inserted = 0;
    let withPrice = 0;
    let withImage = 0;
    let page = 1;
    while (true) {
      const data = await fetchCardsPage(page);
      const cards = data.cards ?? [];

      for (const card of cards) {
        const expansionId = card.expansion?.id ?? card.id?.split("-").slice(0, -1).join("-") ?? "";
        const dbExpansionId = expLookup.get(expansionId);
        if (!dbExpansionId) continue;

        const marketUsd = extractMarketPrice(card);
        const imageUrl = extractImage(card);
        const prices = buildPricesJson(card);

        if (marketUsd != null) withPrice++;
        if (imageUrl != null) withImage++;

        await pool.query(
          `INSERT INTO cards (scrydex_id, name, card_number, printed_total, rarity, supertype, subtypes, image_url, expansion_id, market_price_usd, prices)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (scrydex_id) DO UPDATE
           SET name=EXCLUDED.name, card_number=EXCLUDED.card_number, printed_total=EXCLUDED.printed_total,
               rarity=EXCLUDED.rarity, supertype=EXCLUDED.supertype, subtypes=EXCLUDED.subtypes,
               image_url=EXCLUDED.image_url, expansion_id=EXCLUDED.expansion_id, market_price_usd=EXCLUDED.market_price_usd,
               prices=EXCLUDED.prices`,
          [
            card.id,
            card.name,
            card.number ?? card.printed_number ?? null,
            card.expansion?.printed_total ?? card.printed_total ?? card.printedTotal ?? null,
            card.rarity ?? null,
            card.supertype ?? null,
            card.subtypes ?? [],
            imageUrl,
            dbExpansionId,
            marketUsd,
            prices
          ]
        );
        inserted++;
      }

      logger.info({ page, pageCards: cards.length, totalInserted: inserted, withPrice, withImage }, "scrydex page synced");

      if (!data.hasMore) break;
      page += 1;
    }

    logger.info({ expansions: expansions.length, cards: inserted, withPrice, withImage }, "sync totals");
    await pool.query("UPDATE sync_log SET status='completed', finished_at=now() WHERE id=$1", [logId]);
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, "sync failed");
    await pool.query(
      "UPDATE sync_log SET status='failed', finished_at=now(), error=$2 WHERE id=$1",
      [logId, error instanceof Error ? error.message : "unknown error"]
    );
    throw error;
  }
};
