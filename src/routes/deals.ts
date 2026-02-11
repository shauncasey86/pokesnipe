import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pino from 'pino';
import { pool } from '../db/pool.js';
import { validate } from '../middleware/validation.js';

const log = pino({ name: 'deals-api' });
const router = Router();

/**
 * GET /api/deals — Paginated deal list with filtering and sorting.
 *
 * Query params:
 *   page    — Page number (default 1)
 *   limit   — Items per page (default 50, max 100)
 *   tier    — Comma-separated tier filter: "GRAIL,HIT"
 *   status  — Deal status filter (default "active")
 *   sort    — Sort field: "createdAt" (default), "profitPercent", "profitGbp"
 *   order   — Sort order: "desc" (default) or "asc"
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const status = (req.query.status as string) || 'active';
    const tierFilter = req.query.tier as string;
    const sortField = (req.query.sort as string) || 'createdAt';
    const sortOrder = (req.query.order as string)?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Map sort fields to SQL columns
    const sortMap: Record<string, string> = {
      createdAt: 'created_at',
      profitPercent: 'profit_percent',
      profitGbp: 'profit_gbp',
      confidence: 'confidence',
      tier: 'tier',
    };
    const sortColumn = sortMap[sortField] || 'created_at';

    // Build WHERE clause
    const conditions: string[] = ['d.status = $1'];
    const params: any[] = [status];
    let paramIndex = 2;

    if (tierFilter) {
      const tiers = tierFilter.split(',').map(t => t.trim().toUpperCase());
      conditions.push(`d.tier = ANY($${paramIndex})`);
      params.push(tiers);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Count total
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM deals d WHERE ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count);

    // Fetch page — join cards + expansions for display data
    const { rows } = await pool.query(
      `SELECT
        d.deal_id, d.event_id, d.ebay_item_id, d.ebay_title,
        d.card_id, d.variant_id, d.status,
        d.ebay_price_gbp, d.ebay_shipping_gbp, d.buyer_prot_fee, d.total_cost_gbp,
        d.market_price_usd, d.market_price_gbp, d.exchange_rate,
        d.profit_gbp, d.profit_percent, d.tier,
        d.confidence, d.confidence_tier, d.condition, d.condition_source,
        d.is_graded, d.grading_company, d.grade,
        d.liquidity_score, d.liquidity_grade,
        d.trend_7d, d.trend_30d,
        d.ebay_image_url, d.ebay_url,
        d.seller_name, d.seller_feedback, d.listed_at,
        d.reviewed_at, d.is_correct_match, d.incorrect_reason,
        d.created_at, d.expires_at,
        c.name AS card_name, c.number AS card_number,
        e.name AS expansion_name, e.code AS expansion_code,
        e.logo_url AS expansion_logo
      FROM deals d
      LEFT JOIN cards c ON c.scrydex_card_id = d.card_id
      LEFT JOIN expansions e ON e.scrydex_id = c.expansion_id
      WHERE ${whereClause}
      ORDER BY d.${sortColumn} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset],
    );

    const data = rows.map(row => ({
      ...row,
      cardName: row.card_name || null,
      ebay_price_gbp: parseFloat(row.ebay_price_gbp),
      ebay_shipping_gbp: parseFloat(row.ebay_shipping_gbp),
      buyer_prot_fee: parseFloat(row.buyer_prot_fee),
      total_cost_gbp: parseFloat(row.total_cost_gbp),
      market_price_usd: row.market_price_usd ? parseFloat(row.market_price_usd) : null,
      market_price_gbp: row.market_price_gbp ? parseFloat(row.market_price_gbp) : null,
      profit_gbp: row.profit_gbp ? parseFloat(row.profit_gbp) : null,
      profit_percent: row.profit_percent ? parseFloat(row.profit_percent) : null,
      confidence: row.confidence ? parseFloat(row.confidence) : null,
      liquidity_score: row.liquidity_score ? parseFloat(row.liquidity_score) : null,
    }));

    return res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    log.error({ err }, 'Failed to fetch deals');
    return res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

/**
 * GET /api/deals/:id — Full deal detail.
 * Includes match_signals, condition_comps, and joined card/variant data.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*,
              c.name as card_name, c.number as card_number, c.image_large as card_image_url,
              e.name as expansion_name, e.code as expansion_code,
              e.logo_url as expansion_logo, e.symbol_url as expansion_symbol,
              e.release_date as expansion_release_date, e.printed_total as expansion_card_count,
              e.series as expansion_series,
              v.name as variant_name, v.prices as variant_prices, v.trends as variant_trends
       FROM deals d
       LEFT JOIN cards c ON c.scrydex_card_id = d.card_id
       LEFT JOIN expansions e ON e.scrydex_id = c.expansion_id
       LEFT JOIN variants v ON v.id = d.variant_id
       WHERE d.deal_id = $1`,
      [req.params.id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const deal = rows[0];

    // Parse numeric fields
    const numericFields = [
      'ebay_price_gbp', 'ebay_shipping_gbp', 'buyer_prot_fee', 'total_cost_gbp',
      'market_price_usd', 'market_price_gbp', 'exchange_rate',
      'profit_gbp', 'profit_percent', 'confidence', 'liquidity_score',
      'trend_7d', 'trend_30d',
    ];
    for (const field of numericFields) {
      if (deal[field] != null) deal[field] = parseFloat(deal[field]);
    }

    return res.json(deal);
  } catch (err) {
    log.error({ err }, 'Failed to fetch deal detail');
    return res.status(500).json({ error: 'Failed to fetch deal' });
  }
});

/**
 * POST /api/deals/:id/review — Mark a deal as correctly or incorrectly matched.
 */
const reviewSchema = z.object({
  isCorrectMatch: z.boolean(),
  reason: z.enum(['wrong_card', 'wrong_set', 'wrong_condition', 'wrong_variant', 'wrong_price', 'bad_image']).optional(),
});

router.post('/:id/review', validate(reviewSchema), async (req: Request, res: Response) => {
  try {
    const { isCorrectMatch, reason } = req.body;

    const { rowCount } = await pool.query(
      `UPDATE deals SET
        status = 'reviewed',
        reviewed_at = NOW(),
        is_correct_match = $1,
        incorrect_reason = $2
      WHERE deal_id = $3 AND status IN ('active', 'expired')`,
      [isCorrectMatch, isCorrectMatch ? null : (reason || null), req.params.id],
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Deal not found or already reviewed' });
    }

    log.info({ dealId: req.params.id, isCorrectMatch, reason }, 'Deal reviewed');
    return res.json({ success: true });
  } catch (err) {
    log.error({ err }, 'Failed to review deal');
    return res.status(500).json({ error: 'Failed to review deal' });
  }
});

export default router;
