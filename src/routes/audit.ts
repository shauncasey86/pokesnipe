import { Router, Request, Response } from 'express';
import pino from 'pino';
import { pool } from '../db/pool.js';

const log = pino({ name: 'audit-api' });
const router = Router();

/**
 * GET /api/audit — Paginated sync log entries.
 *
 * Query params:
 *   page      — Page number (default 1)
 *   limit     — Items per page (default 50, max 100)
 *   sync_type — Filter by sync type (e.g. "full_sync", "hot_refresh")
 *   status    — Filter by status ("running", "completed", "failed")
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const syncType = req.query.sync_type as string | undefined;
    const status = req.query.status as string | undefined;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (syncType) {
      conditions.push(`sync_type = $${paramIndex++}`);
      params.push(syncType);
    }
    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM sync_log ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count);

    const { rows } = await pool.query(
      `SELECT
        id, sync_type, started_at, completed_at, status,
        expansions_synced, cards_upserted, variants_upserted,
        credits_used, error_message, metadata,
        CASE WHEN completed_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (completed_at - started_at))
          ELSE NULL
        END AS duration_seconds
      FROM sync_log
      ${whereClause}
      ORDER BY started_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset],
    );

    return res.json({
      data: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch audit log');
    return res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

export default router;
