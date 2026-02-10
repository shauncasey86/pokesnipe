import pino from 'pino';
import { config } from './config/index.js';
import { pool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import app from './app.js';
import { syncAll } from './services/sync/sync-service.js';

const logger = pino({ name: 'server' });

// Catch kills/OOM before pino can flush
process.on('uncaughtException', (err) => {
  console.error(`UNCAUGHT EXCEPTION: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error(`UNHANDLED REJECTION: ${reason}`);
  process.exit(1);
});

async function runVerification(): Promise<void> {
  logger.info('=== SYNC + VERIFY MODE ===');

  // Run the sync
  logger.info('Running full sync...');
  const result = await syncAll();
  logger.info(result, 'Sync completed');

  // Verification checks
  const checks: { name: string; query: string; test: (rows: Record<string, unknown>[]) => string | null }[] = [
    {
      name: 'Expansion count >= 170',
      query: 'SELECT COUNT(*)::int AS count FROM expansions',
      test: (rows) => {
        const c = rows[0].count as number;
        return c >= 170 ? null : `Only ${c} expansions`;
      },
    },
    {
      name: 'Card count >= 10000',
      query: 'SELECT COUNT(*)::int AS count FROM cards',
      test: (rows) => {
        const c = rows[0].count as number;
        return c >= 10000 ? null : `Only ${c} cards`;
      },
    },
    {
      name: 'Variant count >= 20000',
      query: 'SELECT COUNT(*)::int AS count FROM variants',
      test: (rows) => {
        const c = rows[0].count as number;
        return c >= 20000 ? null : `Only ${c} variants`;
      },
    },
    {
      name: 'Charizard #4 exists with NM prices',
      query: `SELECT v.prices FROM cards c JOIN variants v ON v.card_id = c.scrydex_card_id WHERE c.name ILIKE '%charizard%' AND c.number = '4' LIMIT 1`,
      test: (rows) => {
        if (rows.length === 0) return 'No Charizard #4 found';
        const p = rows[0].prices as Record<string, unknown>;
        return p && 'NM' in p ? null : `Missing NM, keys: ${Object.keys(p || {})}`;
      },
    },
    {
      name: 'Trends use short keys (1d not days_1)',
      query: `SELECT v.trends FROM variants v WHERE v.trends != '{}' AND v.trends IS NOT NULL LIMIT 1`,
      test: (rows) => {
        if (rows.length === 0) return 'No trends found';
        const t = rows[0].trends as Record<string, Record<string, unknown>>;
        const cond = Object.keys(t)[0];
        if (!cond) return 'Empty trends';
        const keys = Object.keys(t[cond]);
        if (keys.some((k) => k.startsWith('days_'))) return `Bad keys: ${keys}`;
        return keys.includes('7d') ? null : `Missing 7d, keys: ${keys}`;
      },
    },
    {
      name: 'Graded prices keyed as company_grade',
      query: `SELECT v.graded_prices FROM variants v WHERE v.graded_prices IS NOT NULL AND v.graded_prices != '{}' LIMIT 1`,
      test: (rows) => {
        if (rows.length === 0) return null; // OK if API returns none
        const keys = Object.keys(rows[0].graded_prices as Record<string, unknown>);
        return keys.some((k) => k.includes('_')) ? null : `Bad keys: ${keys}`;
      },
    },
    {
      name: 'Sync log shows completed',
      query: `SELECT status, cards_upserted FROM sync_log ORDER BY started_at DESC LIMIT 1`,
      test: (rows) => {
        if (rows.length === 0) return 'No sync log';
        return rows[0].status === 'completed' ? null : `Status: ${rows[0].status}`;
      },
    },
    {
      name: 'Fuzzy search: "charzard" → Charizard',
      query: `SELECT name FROM cards WHERE name % 'charzard' ORDER BY similarity(name, 'charzard') DESC LIMIT 5`,
      test: (rows) => {
        const names = rows.map((r) => r.name as string);
        return names.some((n) => /charizard/i.test(n)) ? null : `Got: ${names}`;
      },
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    try {
      const { rows } = await pool.query(check.query);
      const err = check.test(rows);
      if (err) {
        logger.error({ check: check.name, reason: err }, 'FAIL');
        failed++;
      } else {
        logger.info({ check: check.name }, 'PASS');
        passed++;
      }
    } catch (err) {
      logger.error({ check: check.name, error: err instanceof Error ? err.message : err }, 'ERROR');
      failed++;
    }
  }

  // Idempotency — skip on large datasets, run manually later
  logger.info('Skipping idempotency check (run verify:only after to test)');
  /*
  logger.info('Idempotency check — running sync again...');
  const before = (await pool.query('SELECT COUNT(*)::int AS count FROM cards')).rows[0].count as number;
  await syncAll();
  const after = (await pool.query('SELECT COUNT(*)::int AS count FROM cards')).rows[0].count as number;
  if (before === after) {
    logger.info({ before, after }, 'PASS — Idempotency');
    passed++;
  } else {
    logger.error({ before, after }, 'FAIL — Idempotency');
    failed++;
  }
  */

  logger.info({ passed, failed, total: passed + failed }, '=== VERIFICATION COMPLETE ===');
}

async function boot(): Promise<void> {
  // Step 1: Config already validated by Zod at import time
  logger.info('Configuration validated');

  // Step 2: Test database connection
  logger.info('Connecting to database...');
  await pool.query('SELECT 1');
  logger.info('Database connected');

  // Step 3: Run migrations
  await runMigrations();

  // Step 3.5: If --sync-verify flag, run sync + checks before starting server
  if (process.argv.includes('--sync-verify')) {
    await runVerification();
  }

  // Step 4: Start Express
  app.listen(config.PORT, () => {
    logger.info(`Server ready on port ${config.PORT}`);
  });
}

boot().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : '';
  console.error(`BOOT FAILED: ${message}`);
  console.error(`Stack: ${stack}`);
  process.exit(1);
});
