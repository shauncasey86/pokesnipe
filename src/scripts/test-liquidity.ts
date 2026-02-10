/**
 * Live liquidity test — run on Railway with:
 *   npx tsx src/scripts/test-liquidity.ts
 *
 * Tests:
 *   1. Tier 1 signals against a real card's pricing/trend data
 *   2. Tier 2 signals with realistic eBay values
 *   3. Tier 3 velocity — real Scrydex API call (costs 3 credits)
 *   4. Composite scoring and grade assignment
 *   5. Tier adjustment logic with real liquidity grades
 *   6. On-demand velocity endpoint via HTTP
 */
import { pool } from '../db/pool.js';
import { scoreTrendActivity, scorePriceCompleteness, scorePriceSpread } from '../services/liquidity/tier1-signals.js';
import { scoreSupply, scoreSold } from '../services/liquidity/tier2-signals.js';
import { getVelocity, scoreVelocity } from '../services/liquidity/tier3-velocity.js';
import { calculateLiquidity } from '../services/liquidity/composite.js';
import { adjustTierForLiquidity } from '../services/liquidity/tier-adjuster.js';

const RAILWAY_URL = process.env.RAILWAY_PUBLIC_URL || process.env.RAILWAY_STATIC_URL || 'http://localhost:8080';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function main() {
  console.log('\n🧪 Live Liquidity Engine Test\n');

  // ── Test 1: Find a real card with pricing data ──
  console.log('── Test 1: Fetch a real card with pricing + trends ──');
  const { rows: cards } = await pool.query(`
    SELECT v.id, v.name as variant_name, v.prices, v.trends, c.scrydex_card_id, c.name as card_name
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
    console.log('\n⚠️  No cards with pricing data found. Run card sync first.');
    process.exit(1);
  }

  const card = cards[0];
  const prices = card.prices;
  const trends = card.trends;
  console.log(`  Card: ${card.card_name} (${card.scrydex_card_id})`);
  console.log(`  Variant: ${card.variant_name}`);

  // ── Test 2: Tier 1 signals ──
  console.log('\n── Test 2: Tier 1 signals (from synced data) ──');

  const trendScore = scoreTrendActivity(trends?.NM || trends?.LP || Object.values(trends || {})[0]);
  check('scoreTrendActivity returns 0-1', trendScore >= 0 && trendScore <= 1, `${trendScore}`);

  const completeness = scorePriceCompleteness(prices);
  check('scorePriceCompleteness returns 0-1', completeness >= 0 && completeness <= 1, `${completeness}`);

  const condition = prices?.NM?.market ? 'NM' : (prices?.LP?.market ? 'LP' : 'MP');
  const spread = scorePriceSpread(prices, condition);
  check('scorePriceSpread returns 0-1', spread >= 0 && spread <= 1, `${spread} (${condition})`);

  // ── Test 3: Tier 2 signals ──
  console.log('\n── Test 3: Tier 2 signals (eBay-derived) ──');

  const supply = scoreSupply(3);
  check('scoreSupply(3) returns 0.6', Math.abs(supply - 0.6) < 0.01, `${supply}`);

  const sold = scoreSold(2);
  check('scoreSold(2) returns ~0.667', sold > 0.6 && sold < 0.7, `${sold}`);

  // ── Test 4: Tier 3 velocity (real Scrydex API call — costs 3 credits) ──
  console.log('\n── Test 4: Tier 3 velocity (real Scrydex API — 3 credits) ──');

  const velocity = await getVelocity(card.scrydex_card_id, card.variant_name || 'default');
  check('getVelocity returned data', velocity !== null, `fetched=${velocity.fetched}`);
  check('sales7d is a number', typeof velocity.sales7d === 'number', `${velocity.sales7d}`);
  check('sales30d is a number', typeof velocity.sales30d === 'number', `${velocity.sales30d}`);
  console.log(`  Median price: ${velocity.medianPrice ?? 'N/A'}`);
  console.log(`  Avg days between sales: ${velocity.avgDaysBetweenSales ?? 'N/A'}`);

  const velScore = scoreVelocity(velocity);
  check('scoreVelocity returns 0-1', velScore >= 0 && velScore <= 1, `${velScore}`);

  // ── Test 5: Check velocity cache was populated ──
  console.log('\n── Test 5: Velocity cache ──');

  const { rows: cache } = await pool.query(
    'SELECT * FROM sales_velocity_cache WHERE card_id = $1 AND variant_name = $2',
    [card.scrydex_card_id, card.variant_name || 'default']
  );
  check('Velocity cached in DB', cache.length > 0);
  if (cache.length > 0) {
    check('Cache has sales_7d', cache[0].sales_7d !== null, `${cache[0].sales_7d}`);
    check('Cache has sales_30d', cache[0].sales_30d !== null, `${cache[0].sales_30d}`);
    check('Cache has fetched_at', cache[0].fetched_at !== null);
  }

  // ── Test 6: Composite score ──
  console.log('\n── Test 6: Composite liquidity score ──');

  const liquidity = calculateLiquidity(
    { prices, trends: trends || {} },
    condition,
    { concurrentSupply: 3, quantitySold: 1 },
    velocity
  );
  check('Composite score is 0-1', liquidity.composite >= 0 && liquidity.composite <= 1, `${liquidity.composite}`);
  check('Grade is valid', ['high', 'medium', 'low', 'illiquid'].includes(liquidity.grade), liquidity.grade);
  console.log(`  Signals: trend=${liquidity.signals.trendActivity}, prices=${liquidity.signals.priceCompleteness}, spread=${liquidity.signals.priceSpread}, supply=${liquidity.signals.supply}, sold=${liquidity.signals.sold}, velocity=${liquidity.signals.velocity}`);

  // ── Test 7: Tier adjustment ──
  console.log('\n── Test 7: Tier adjustment with real grade ──');

  const adjusted = adjustTierForLiquidity('GRAIL', liquidity.grade);
  const expectedAdjustment: Record<string, string> = {
    high: 'GRAIL',
    medium: 'HIT',
    low: 'FLIP',
    illiquid: 'SLEEP',
  };
  check(`GRAIL + ${liquidity.grade} → ${adjusted}`, adjusted === expectedAdjustment[liquidity.grade], `expected ${expectedAdjustment[liquidity.grade]}`);

  // ── Test 8: Velocity endpoint (HTTP) ──
  console.log('\n── Test 8: Velocity endpoint ──');

  const { rows: deals } = await pool.query(
    'SELECT deal_id FROM deals ORDER BY created_at DESC LIMIT 1'
  );
  if (deals.length > 0) {
    const url = `${RAILWAY_URL}/api/deals/${deals[0].deal_id}/velocity`;
    console.log(`  Calling: ${url}`);
    try {
      const res = await fetch(url);
      check('Velocity endpoint returns 200', res.status === 200, `status=${res.status}`);
      if (res.ok) {
        const data = await res.json();
        check('Response has velocity data', data.velocity !== undefined);
        check('Response has liquidity data', data.liquidity !== undefined);
        check('Liquidity has grade', data.liquidity?.grade !== undefined, data.liquidity?.grade);
      }
    } catch (err: any) {
      check('Velocity endpoint reachable', false, err.message);
    }
  } else {
    console.log('  ⚠️  No deals in DB yet — skipping endpoint test (scanner needs to run first)');
  }

  // ── Summary ──
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ ${passed} passed, ❌ ${failed} failed`);

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
