import { pool } from '../../db/pool.js';

/**
 * Persist a pipeline event to the sync_log table.
 *
 * Reuses the existing sync_log schema:
 *   sync_type      — event category (e.g. 'ebay_scan', 'deal_cleanup', 'hot_refresh')
 *   status         — 'completed' | 'failed'
 *   metadata       — JSONB with event-specific stats
 *   started_at / completed_at — for duration calculation
 *   expansions_synced / cards_upserted / variants_upserted — reused where applicable
 */
export async function logAuditEvent(opts: {
  syncType: string;
  status: 'completed' | 'failed';
  durationMs: number;
  metadata?: Record<string, unknown>;
  expansionsSynced?: number;
  cardsUpserted?: number;
  variantsUpserted?: number;
  errorMessage?: string;
}): Promise<void> {
  const startedAt = new Date(Date.now() - opts.durationMs);

  await pool.query(
    `INSERT INTO sync_log (
      sync_type, status, started_at, completed_at,
      expansions_synced, cards_upserted, variants_upserted,
      error_message, metadata
    ) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8)`,
    [
      opts.syncType,
      opts.status,
      startedAt,
      opts.expansionsSynced ?? 0,
      opts.cardsUpserted ?? 0,
      opts.variantsUpserted ?? 0,
      opts.errorMessage ?? null,
      opts.metadata ? JSON.stringify(opts.metadata) : null,
    ],
  );
}
