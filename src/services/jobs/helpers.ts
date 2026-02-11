import pino from 'pino';
import { pool } from '../../db/pool.js';

const log = pino({ name: 'job-helpers' });

/**
 * Get the N most recently released expansions.
 * Used by hot-refresh to re-sync recent sets (prices change frequently for new sets).
 */
export async function getRecentExpansions(n: number): Promise<Array<{ scrydexId: string; name: string }>> {
  const { rows } = await pool.query(
    `SELECT scrydex_id, name
     FROM expansions
     ORDER BY release_date DESC NULLS LAST
     LIMIT $1`,
    [n]
  );
  return rows.map(r => ({ scrydexId: r.scrydex_id, name: r.name }));
}

/**
 * Check for new expansions by comparing Scrydex API against what's in our DB.
 * Returns only expansions that exist in Scrydex but not in our expansions table.
 */
export async function checkForNewExpansions(
  fetchExpansionsFromScrydex: () => Promise<Array<{ id: string; name: string }>>
): Promise<Array<{ id: string; name: string }>> {
  const scrydexExpansions = await fetchExpansionsFromScrydex();

  // Get all existing expansion IDs
  const { rows } = await pool.query('SELECT scrydex_id FROM expansions');
  const existingIds = new Set(rows.map(r => r.scrydex_id));

  const newExpansions = scrydexExpansions.filter(e => !existingIds.has(e.id));

  if (newExpansions.length > 0) {
    log.info({ count: newExpansions.length, names: newExpansions.map(e => e.name) }, 'Found new expansions');
  }

  return newExpansions;
}

/**
 * Get the top N most frequently matched cards (by deal count).
 * Used by velocity pre-fetch to cache sales velocity for popular cards.
 */
export async function getTopMatchedCards(n: number): Promise<Array<{ cardId: string; variantName: string }>> {
  const { rows } = await pool.query(
    `SELECT d.card_id, v.name as variant_name, COUNT(*) as deal_count
     FROM deals d
     LEFT JOIN variants v ON v.id = d.variant_id
     WHERE d.card_id IS NOT NULL
     GROUP BY d.card_id, v.name
     ORDER BY deal_count DESC
     LIMIT $1`,
    [n]
  );
  return rows.map(r => ({ cardId: r.card_id, variantName: r.variant_name || 'default' }));
}
