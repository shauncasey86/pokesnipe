import { pool } from "../db/pool.js";
import { fetchAllCards, fetchExpansions } from "./scrydexClient.js";
import { pino } from "pino";

const logger = pino({ name: "sync" });

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

    const cards = await fetchAllCards((page, count) => {
      logger.info({ page, count }, "scrydex page synced");
    });
    let inserted = 0;
    for (const card of cards) {
      const expansionId = expLookup.get(card.expansionId);
      if (!expansionId) continue;
      // Market price: try various field names the API might use
      const p = card.prices as Record<string, any>;
      const marketUsd = p?.market ?? p?.tcgplayer_market ?? p?.normal?.market ?? null;
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
          card.number,
          card.printedTotal,
          card.rarity,
          card.supertype,
          card.subtypes,
          card.images?.large ?? card.images?.small ?? null,
          expansionId,
          marketUsd,
          card.prices
        ]
      );
      inserted++;
    }
    logger.info({ expansions: expansions.length, cards: inserted }, "sync totals");
    await pool.query("UPDATE sync_log SET status='completed', finished_at=now() WHERE id=$1", [logId]);
  } catch (error) {
    logger.error({ error }, "sync failed");
    await pool.query(
      "UPDATE sync_log SET status='failed', finished_at=now(), error=$2 WHERE id=$1",
      [logId, error instanceof Error ? error.message : "unknown error"]
    );
    throw error;
  }
};
