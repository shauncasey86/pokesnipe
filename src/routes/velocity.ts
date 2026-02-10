import { Router } from 'express';
import pino from 'pino';
import { pool } from '../db/pool.js';
import { getVelocity } from '../services/liquidity/index.js';
import { calculateLiquidity } from '../services/liquidity/index.js';

const log = pino({ name: 'velocity-route' });
const router = Router();

/**
 * GET /api/deals/:id/velocity
 *
 * Fetches (or refreshes) Tier 3 velocity data for a deal's card.
 * Costs 3 Scrydex credits per call (cached 7 days).
 *
 * Returns updated liquidity assessment with velocity signal.
 */
router.get('/deals/:id/velocity', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the deal's card and variant info
    const { rows } = await pool.query(
      `SELECT d.deal_id, d.card_id, d.condition,
              v.name as variant_name, v.prices, v.trends
       FROM deals d
       LEFT JOIN variants v ON v.id = d.variant_id
       WHERE d.deal_id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const deal = rows[0];
    if (!deal.card_id) {
      return res.status(400).json({ error: 'Deal has no matched card' });
    }

    // Fetch velocity (force fresh fetch, bypassing cache)
    const velocityData = await getVelocity(
      deal.card_id,
      deal.variant_name || 'default',
      true // forceFetch
    );

    // Recalculate liquidity with the new velocity data
    const variant = {
      prices: deal.prices || {},
      trends: deal.trends || {},
    };

    const liquidity = calculateLiquidity(
      variant,
      deal.condition || 'NM',
      { concurrentSupply: 0, quantitySold: 0 }, // no scan-batch context here
      velocityData
    );

    // Update the deal's liquidity fields
    await pool.query(
      `UPDATE deals SET
         liquidity_score = $1,
         liquidity_grade = $2
       WHERE deal_id = $3`,
      [liquidity.composite, liquidity.grade, id]
    );

    log.info({ dealId: id, grade: liquidity.grade, score: liquidity.composite }, 'Velocity fetched for deal');

    return res.json({
      dealId: id,
      velocity: velocityData,
      liquidity: {
        composite: liquidity.composite,
        grade: liquidity.grade,
        signals: liquidity.signals,
      },
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch velocity');
    return res.status(500).json({ error: 'Failed to fetch velocity' });
  }
});

export default router;
