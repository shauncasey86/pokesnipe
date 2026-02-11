import pino from 'pino';
import { pool } from '../../db/pool.js';

const log = pino({ name: 'deal-pruner' });

/**
 * Hard-delete deals that are >30 days old AND were never reviewed.
 *
 * Reviewed deals (is_correct_match IS NOT NULL) are kept forever
 * because they form the accuracy tracking corpus.
 *
 * @returns Number of deals deleted
 */
export async function pruneStaleDeals(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM deals
     WHERE status IN ('active', 'expired')
       AND created_at < NOW() - INTERVAL '30 days'
       AND is_correct_match IS NULL
     RETURNING deal_id`
  );

  const count = result.rowCount || 0;
  if (count > 0) {
    log.info({ pruned: count }, 'Pruned stale unreviewed deals');
  }
  return count;
}
