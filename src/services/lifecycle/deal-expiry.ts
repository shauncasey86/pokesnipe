import pino from 'pino';
import { pool } from '../../db/pool.js';

const log = pino({ name: 'deal-expiry' });

/**
 * Mark active deals as 'expired' if they've passed their expires_at timestamp.
 *
 * The deals table has: expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '72 hours'
 * This function runs hourly to catch any deals that have crossed that threshold.
 *
 * @returns Number of deals expired
 */
export async function expireOldDeals(): Promise<number> {
  const result = await pool.query(
    `UPDATE deals
     SET status = 'expired'
     WHERE status = 'active'
       AND expires_at < NOW()
     RETURNING deal_id`
  );

  const count = result.rowCount || 0;
  if (count > 0) {
    log.info({ expired: count }, 'Expired old deals');
  }
  return count;
}
