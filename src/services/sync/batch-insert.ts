import { pool } from '../../db/pool.js';
import type { ExpansionRow, CardRow, VariantRow } from './transformers.js';

const CHUNK_SIZE = 100;

/** Deduplicate an array by a key function. Last occurrence wins. */
function dedup<T>(arr: T[], keyFn: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of arr) {
    map.set(keyFn(item), item);
  }
  return Array.from(map.values());
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function batchUpsertExpansions(expansions: ExpansionRow[]): Promise<number> {
  let total = 0;

  for (const batch of chunk(expansions, CHUNK_SIZE)) {
    const values: unknown[] = [];
    const rows: string[] = [];

    for (let i = 0; i < batch.length; i++) {
      const e = batch[i];
      const offset = i * 10;
      rows.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`,
      );
      values.push(
        e.scrydex_id,
        e.name,
        e.code,
        e.series,
        e.printed_total,
        e.total,
        e.release_date,
        e.language_code,
        e.logo_url,
        e.symbol_url,
      );
    }

    const query = `
      INSERT INTO expansions (scrydex_id, name, code, series, printed_total, total, release_date, language_code, logo_url, symbol_url)
      VALUES ${rows.join(', ')}
      ON CONFLICT (scrydex_id) DO UPDATE SET
        name = EXCLUDED.name,
        code = EXCLUDED.code,
        series = EXCLUDED.series,
        printed_total = EXCLUDED.printed_total,
        total = EXCLUDED.total,
        release_date = EXCLUDED.release_date,
        language_code = EXCLUDED.language_code,
        logo_url = EXCLUDED.logo_url,
        symbol_url = EXCLUDED.symbol_url,
        last_synced_at = NOW()
    `;

    const result = await pool.query(query, values);
    total += result.rowCount ?? 0;
  }

  return total;
}

export async function batchUpsertCards(cards: CardRow[]): Promise<number> {
  let total = 0;
  const dedupedCards = dedup(cards, (c) => c.scrydex_card_id);

  for (const batch of chunk(dedupedCards, CHUNK_SIZE)) {
    const values: unknown[] = [];
    const rows: string[] = [];

    for (let i = 0; i < batch.length; i++) {
      const c = batch[i];
      const offset = i * 16;
      rows.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16})`,
      );
      values.push(
        c.scrydex_card_id,
        c.name,
        c.number,
        c.number_normalized,
        c.expansion_id,
        c.expansion_name,
        c.expansion_code,
        c.printed_total,
        c.rarity,
        c.supertype,
        c.subtypes,
        c.artist,
        c.image_small,
        c.image_medium,
        c.image_large,
        c.market_price_usd,
      );
    }

    const query = `
      INSERT INTO cards (scrydex_card_id, name, number, number_normalized, expansion_id, expansion_name, expansion_code, printed_total, rarity, supertype, subtypes, artist, image_small, image_medium, image_large, market_price_usd)
      VALUES ${rows.join(', ')}
      ON CONFLICT (scrydex_card_id) DO UPDATE SET
        name = EXCLUDED.name,
        number = EXCLUDED.number,
        number_normalized = EXCLUDED.number_normalized,
        expansion_name = EXCLUDED.expansion_name,
        expansion_code = EXCLUDED.expansion_code,
        printed_total = EXCLUDED.printed_total,
        rarity = EXCLUDED.rarity,
        supertype = EXCLUDED.supertype,
        subtypes = EXCLUDED.subtypes,
        artist = EXCLUDED.artist,
        image_small = EXCLUDED.image_small,
        image_medium = EXCLUDED.image_medium,
        image_large = EXCLUDED.image_large,
        market_price_usd = EXCLUDED.market_price_usd,
        last_synced_at = NOW()
    `;

    const result = await pool.query(query, values);
    total += result.rowCount ?? 0;
  }

  return total;
}

export async function batchUpsertVariants(variants: VariantRow[]): Promise<number> {
  let total = 0;
  const dedupedVariants = dedup(variants, (v) => `${v.card_id}:${v.name}`);

  for (const batch of chunk(dedupedVariants, CHUNK_SIZE)) {
    const values: unknown[] = [];
    const rows: string[] = [];

    for (let i = 0; i < batch.length; i++) {
      const v = batch[i];
      const offset = i * 8;
      rows.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`,
      );
      values.push(
        v.card_id,
        v.name,
        v.image_small,
        v.image_medium,
        v.image_large,
        JSON.stringify(v.prices),
        JSON.stringify(v.graded_prices ?? {}),
        JSON.stringify(v.trends),
      );
    }

    const query = `
      INSERT INTO variants (card_id, name, image_small, image_medium, image_large, prices, graded_prices, trends)
      VALUES ${rows.join(', ')}
      ON CONFLICT (card_id, name) DO UPDATE SET
        image_small = EXCLUDED.image_small,
        image_medium = EXCLUDED.image_medium,
        image_large = EXCLUDED.image_large,
        prices = EXCLUDED.prices,
        graded_prices = EXCLUDED.graded_prices,
        trends = EXCLUDED.trends,
        last_price_update = NOW()
    `;

    const result = await pool.query(query, values);
    total += result.rowCount ?? 0;
  }

  return total;
}
