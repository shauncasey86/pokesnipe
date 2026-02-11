import pino from 'pino';
import { pool } from '../../db/pool.js';

const log = pino({ name: 'deal-status' });

export type DealStatus = 'active' | 'expired' | 'sold' | 'reviewed';

/**
 * Valid status transitions:
 *   active -> expired  (TTL)
 *   active -> reviewed (user action)
 *   active -> sold     (eBay listing ended/sold)
 *   expired -> reviewed (user can still review expired deals)
 *   sold -> reviewed   (user can review sold deals)
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  active: ['expired', 'reviewed', 'sold'],
  expired: ['reviewed'],
  sold: ['reviewed'],
  reviewed: [], // terminal state
};

/**
 * Update a deal's status with validation.
 *
 * @param dealId - UUID of the deal
 * @param newStatus - Target status
 * @returns true if updated, false if deal not found or invalid transition
 */
export async function updateDealStatus(dealId: string, newStatus: DealStatus): Promise<boolean> {
  // Get current status
  const { rows } = await pool.query(
    'SELECT status FROM deals WHERE deal_id = $1',
    [dealId]
  );

  if (rows.length === 0) {
    log.warn({ dealId }, 'Deal not found for status update');
    return false;
  }

  const currentStatus = rows[0].status;
  const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];

  if (!allowedTransitions.includes(newStatus)) {
    log.warn({ dealId, currentStatus, newStatus }, 'Invalid status transition');
    return false;
  }

  await pool.query(
    'UPDATE deals SET status = $1 WHERE deal_id = $2',
    [newStatus, dealId]
  );

  log.info({ dealId, from: currentStatus, to: newStatus }, 'Deal status updated');
  return true;
}
