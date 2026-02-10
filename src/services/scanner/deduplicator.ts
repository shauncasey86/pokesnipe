import pino from 'pino';
import { pool } from '../../db/pool.js';

const log = pino({ name: 'deduplicator' });

const seen = new Set<string>();
const MAX_SEEN = 10_000;

/**
 * Check if an eBay item has already been processed.
 * Returns true if duplicate (skip it), false if new.
 */
export async function isDuplicate(itemId: string): Promise<boolean> {
  // Layer 1: in-memory
  if (seen.has(itemId)) return true;

  // Layer 2: database
  const { rows } = await pool.query(
    'SELECT 1 FROM deals WHERE ebay_item_id = $1 LIMIT 1',
    [itemId],
  );
  if (rows.length > 0) {
    seen.add(itemId); // cache for future checks
    return true;
  }

  return false;
}

/**
 * Mark an item as processed (add to in-memory set).
 * Call this AFTER deciding to process the item (not after creating the deal).
 */
export function markProcessed(itemId: string): void {
  if (seen.size >= MAX_SEEN) {
    // Evict oldest entries (Set iterates in insertion order)
    const iterator = seen.values();
    const toEvict = seen.size - MAX_SEEN + 1000; // evict 1000 at a time
    for (let i = 0; i < toEvict; i++) {
      const val = iterator.next().value;
      if (val) seen.delete(val);
    }
    log.info({ evicted: toEvict, remaining: seen.size }, 'Evicted old entries from dedup set');
  }
  seen.add(itemId);
}

/**
 * Get current dedup set size (for diagnostics).
 */
export function getDedupStats(): { memorySize: number; maxSize: number } {
  return { memorySize: seen.size, maxSize: MAX_SEEN };
}
