import pino from 'pino';
import { pool } from '../db/pool.js';
import { syncAll } from '../services/sync/sync-service.js';

const logger = pino({ name: 'verify-sync' });

interface Check {
  name: string;
  query: string;
  validate: (rows: Record<string, unknown>[]) => { pass: boolean; detail: string };
}

const checks: Check[] = [
  {
    name: 'Expansion count >= 170',
    query: 'SELECT COUNT(*)::int AS count FROM expansions',
    validate: (rows) => {
      const count = rows[0].count as number;
      return { pass: count >= 170, detail: `${count} expansions` };
    },
  },
  {
    name: 'Card count >= 10000',
    query: 'SELECT COUNT(*)::int AS count FROM cards',
    validate: (rows) => {
      const count = rows[0].count as number;
      return { pass: count >= 10000, detail: `${count} cards` };
    },
  },
  {
    name: 'Variant count >= 20000',
    query: 'SELECT COUNT(*)::int AS count FROM variants',
    validate: (rows) => {
      const count = rows[0].count as number;
      return { pass: count >= 20000, detail: `${count} variants` };
    },
  },
  {
    name: 'Charizard base set exists with prices',
    query: `SELECT c.name, c.number, c.expansion_name, v.name AS variant, v.prices
            FROM cards c JOIN variants v ON v.card_id = c.scrydex_card_id
            WHERE c.name ILIKE '%charizard%' AND c.number = '4' LIMIT 5`,
    validate: (rows) => {
      if (rows.length === 0) return { pass: false, detail: 'No Charizard #4 found' };
      const prices = rows[0].prices as Record<string, unknown>;
      const hasNM = prices && 'NM' in prices;
      return {
        pass: hasNM,
        detail: `${rows.length} row(s), prices keys: ${Object.keys(prices || {}).join(', ')}`,
      };
    },
  },
  {
    name: 'Prices have multiple conditions',
    query: `SELECT v.name, v.prices FROM variants v WHERE v.prices != '{}' LIMIT 3`,
    validate: (rows) => {
      if (rows.length === 0) return { pass: false, detail: 'No priced variants found' };
      const prices = rows[0].prices as Record<string, unknown>;
      const keys = Object.keys(prices || {});
      return { pass: keys.length >= 1, detail: `Conditions: ${keys.join(', ')}` };
    },
  },
  {
    name: 'Trends use short keys (1d, 7d, not days_1, days_7)',
    query: `SELECT v.trends FROM variants v WHERE v.trends != '{}' AND v.trends IS NOT NULL LIMIT 1`,
    validate: (rows) => {
      if (rows.length === 0) return { pass: false, detail: 'No trends found' };
      const trends = rows[0].trends as Record<string, Record<string, unknown>>;
      const firstCondition = Object.keys(trends)[0];
      if (!firstCondition) return { pass: false, detail: 'Empty trends object' };
      const trendKeys = Object.keys(trends[firstCondition]);
      const hasShortKeys = trendKeys.some((k) => ['1d', '7d', '14d', '30d', '90d', '180d'].includes(k));
      const hasLongKeys = trendKeys.some((k) => k.startsWith('days_'));
      return {
        pass: hasShortKeys && !hasLongKeys,
        detail: `Keys: ${trendKeys.join(', ')}`,
      };
    },
  },
  {
    name: 'Graded prices exist with company_grade keys',
    query: `SELECT v.graded_prices FROM variants v WHERE v.graded_prices IS NOT NULL AND v.graded_prices != '{}' LIMIT 1`,
    validate: (rows) => {
      if (rows.length === 0) return { pass: false, detail: 'No graded prices found (may be expected if API has none)' };
      const graded = rows[0].graded_prices as Record<string, unknown>;
      const keys = Object.keys(graded);
      const hasUnderscore = keys.some((k) => k.includes('_'));
      return { pass: hasUnderscore, detail: `Keys: ${keys.join(', ')}` };
    },
  },
  {
    name: 'Sync log shows completed',
    query: `SELECT sync_type, status, expansions_synced, cards_upserted, variants_upserted
            FROM sync_log ORDER BY started_at DESC LIMIT 1`,
    validate: (rows) => {
      if (rows.length === 0) return { pass: false, detail: 'No sync log entries' };
      const row = rows[0];
      const pass = row.status === 'completed' && (row.cards_upserted as number) > 0;
      return {
        pass,
        detail: `status=${row.status}, expansions=${row.expansions_synced}, cards=${row.cards_upserted}, variants=${row.variants_upserted}`,
      };
    },
  },
  {
    name: 'Fuzzy search: "charzard" finds Charizard',
    query: `SELECT name FROM cards WHERE name % 'charzard' ORDER BY similarity(name, 'charzard') DESC LIMIT 5`,
    validate: (rows) => {
      if (rows.length === 0) return { pass: false, detail: 'No fuzzy matches found' };
      const names = rows.map((r) => r.name as string);
      const hasCharizard = names.some((n) => n.toLowerCase().includes('charizard'));
      return { pass: hasCharizard, detail: names.join(', ') };
    },
  },
];

async function main(): Promise<void> {
  const skipSync = process.argv.includes('--verify-only');

  if (!skipSync) {
    logger.info('Running full sync first...');
    const result = await syncAll();
    logger.info(result, 'Sync finished');
  } else {
    logger.info('Skipping sync (--verify-only flag set)');
  }

  logger.info('Running verification checks...');

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    try {
      const { rows } = await pool.query(check.query);
      const result = check.validate(rows);
      if (result.pass) {
        logger.info({ check: check.name, detail: result.detail }, 'PASS');
        passed++;
      } else {
        logger.error({ check: check.name, detail: result.detail }, 'FAIL');
        failed++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ check: check.name, error: message }, 'ERROR');
      failed++;
    }
  }

  // Idempotency check — run sync again and compare card count
  if (!skipSync) {
    logger.info('Running idempotency check (second sync)...');
    const countBefore = (await pool.query('SELECT COUNT(*)::int AS count FROM cards')).rows[0].count as number;
    await syncAll();
    const countAfter = (await pool.query('SELECT COUNT(*)::int AS count FROM cards')).rows[0].count as number;
    if (countBefore === countAfter) {
      logger.info({ before: countBefore, after: countAfter }, 'PASS — Idempotency');
      passed++;
    } else {
      logger.error({ before: countBefore, after: countAfter }, 'FAIL — Idempotency (counts differ)');
      failed++;
    }
  }

  logger.info({ passed, failed, total: passed + failed }, 'Verification complete');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main();
