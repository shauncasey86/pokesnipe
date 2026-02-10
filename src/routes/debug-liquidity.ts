import { Router } from 'express';
import pino from 'pino';
import { pool } from '../db/pool.js';
import { scoreTrendActivity, scorePriceCompleteness, scorePriceSpread } from '../services/liquidity/tier1-signals.js';
import { scoreSupply, scoreSold } from '../services/liquidity/tier2-signals.js';
import { getVelocity, scoreVelocity } from '../services/liquidity/index.js';
import { calculateLiquidity } from '../services/liquidity/composite.js';
import { adjustTierForLiquidity } from '../services/liquidity/tier-adjuster.js';

const log = pino({ name: 'debug-liquidity' });
const debugLiquidityRouter = Router();

/**
 * GET /api/debug/test-liquidity
 *
 * Runs the full liquidity pipeline against a real card from the DB.
 * Costs 3 Scrydex credits (one velocity API call).
 *
 * Returns structured test results for each stage.
 */
debugLiquidityRouter.get('/api/debug/test-liquidity', async (_req, res) => {
  const startTime = Date.now();
  const tests: Array<{ label: string; passed: boolean; detail?: string }> = [];

  function check(label: string, ok: boolean, detail?: string) {
    tests.push({ label, passed: ok, detail });
  }

  try {
    // ── Test 1: Find a real card with pricing data ──
    const { rows: cards } = await pool.query(`
      SELECT v.id, v.name as variant_name, v.prices, v.trends,
             c.scrydex_card_id, c.name as card_name
      FROM variants v
      JOIN cards c ON c.scrydex_card_id = v.card_id
      WHERE v.prices IS NOT NULL
        AND v.prices::text != '{}'
        AND v.prices::text != 'null'
      ORDER BY RANDOM()
      LIMIT 1
    `);

    check('Found card with pricing data', cards.length > 0, cards[0]?.card_name);

    if (cards.length === 0) {
      res.json({
        ok: false,
        timing: `${Date.now() - startTime}ms`,
        error: 'No cards with pricing data found. Run card sync first.',
        tests,
      });
      return;
    }

    const card = cards[0];
    const prices = card.prices;
    const trends = card.trends;

    // ── Test 2: Tier 1 signals ──
    const trendInput = trends?.NM || trends?.LP || (trends ? Object.values(trends)[0] : null);
    const trendScore = scoreTrendActivity(trendInput);
    check('scoreTrendActivity returns 0-1', trendScore >= 0 && trendScore <= 1, `${trendScore}`);

    const completeness = scorePriceCompleteness(prices);
    check('scorePriceCompleteness returns 0-1', completeness >= 0 && completeness <= 1, `${completeness}`);

    const condition = prices?.NM?.market ? 'NM' : (prices?.LP?.market ? 'LP' : 'MP');
    const spread = scorePriceSpread(prices, condition);
    check('scorePriceSpread returns 0-1', spread >= 0 && spread <= 1, `${spread} (${condition})`);

    // ── Test 3: Tier 2 signals ──
    const supply = scoreSupply(3);
    check('scoreSupply(3) returns 0.6', Math.abs(supply - 0.6) < 0.01, `${supply}`);

    const sold = scoreSold(2);
    check('scoreSold(2) returns ~0.667', sold > 0.6 && sold < 0.7, `${sold}`);

    // ── Test 4: Tier 3 velocity (real Scrydex API — 3 credits) ──
    const velocity = await getVelocity(card.scrydex_card_id, card.variant_name || 'default');
    check('getVelocity returned data', velocity !== null, `fetched=${velocity.fetched}`);
    check('sales7d is a number', typeof velocity.sales7d === 'number', `${velocity.sales7d}`);
    check('sales30d is a number', typeof velocity.sales30d === 'number', `${velocity.sales30d}`);

    const velScore = scoreVelocity(velocity);
    check('scoreVelocity returns 0-1', velScore >= 0 && velScore <= 1, `${velScore}`);

    // ── Test 5: Velocity cache ──
    const { rows: cache } = await pool.query(
      'SELECT * FROM sales_velocity_cache WHERE card_id = $1 AND variant_name = $2',
      [card.scrydex_card_id, card.variant_name || 'default']
    );
    check('Velocity cached in DB', cache.length > 0);
    if (cache.length > 0) {
      check('Cache has sales_7d', cache[0].sales_7d !== null, `${cache[0].sales_7d}`);
      check('Cache has sales_30d', cache[0].sales_30d !== null, `${cache[0].sales_30d}`);
    }

    // ── Test 6: Composite score ──
    const liquidity = calculateLiquidity(
      { prices, trends: trends || {} },
      condition,
      { concurrentSupply: 3, quantitySold: 1 },
      velocity
    );
    check('Composite score is 0-1', liquidity.composite >= 0 && liquidity.composite <= 1, `${liquidity.composite}`);
    check('Grade is valid', ['high', 'medium', 'low', 'illiquid'].includes(liquidity.grade), liquidity.grade);

    // ── Test 7: Tier adjustment ──
    const adjusted = adjustTierForLiquidity('GRAIL', liquidity.grade);
    const expectedMap: Record<string, string> = { high: 'GRAIL', medium: 'HIT', low: 'FLIP', illiquid: 'SLEEP' };
    check(
      `GRAIL + ${liquidity.grade} → ${adjusted}`,
      adjusted === expectedMap[liquidity.grade],
      `expected ${expectedMap[liquidity.grade]}`,
    );

    // ── Test 8: Velocity endpoint (self-call) ──
    const { rows: deals } = await pool.query(
      'SELECT deal_id FROM deals ORDER BY created_at DESC LIMIT 1'
    );
    if (deals.length > 0) {
      check('Deal exists for velocity endpoint test', true, deals[0].deal_id);
    } else {
      check('Deal exists for velocity endpoint test', false, 'No deals in DB yet');
    }

    const passed = tests.filter(t => t.passed).length;
    const failed = tests.filter(t => !t.passed).length;

    res.json({
      ok: failed === 0,
      timing: `${Date.now() - startTime}ms`,
      summary: { passed, failed, total: tests.length },
      card: {
        name: card.card_name,
        id: card.scrydex_card_id,
        variant: card.variant_name,
      },
      velocity: {
        sales7d: velocity.sales7d,
        sales30d: velocity.sales30d,
        medianPrice: velocity.medianPrice,
        avgDaysBetweenSales: velocity.avgDaysBetweenSales,
        fetched: velocity.fetched,
      },
      liquidity: {
        composite: liquidity.composite,
        grade: liquidity.grade,
        signals: liquidity.signals,
      },
      tierAdjustment: {
        input: 'GRAIL',
        grade: liquidity.grade,
        output: adjusted,
      },
      tests,
    });
  } catch (err) {
    log.error({ err }, 'Debug liquidity test failed');
    res.status(500).json({
      ok: false,
      timing: `${Date.now() - startTime}ms`,
      error: err instanceof Error ? err.message : String(err),
      tests,
    });
  }
});

export { debugLiquidityRouter };
