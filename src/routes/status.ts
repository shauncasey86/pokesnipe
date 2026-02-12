import { Router, Request, Response } from 'express';
import pino from 'pino';
import { pool } from '../db/pool.js';
import { getBudgetStatus } from '../services/ebay/budget.js';
import { getDedupStats } from '../services/scanner/deduplicator.js';
import { getJobStatuses, pauseJob, resumeJob } from '../services/jobs/index.js';
import { getAccuracyStats } from '../services/accuracy/tracker.js';
import { getAccountUsage } from '../services/scrydex/client.js';
import { getActiveWeights, SPEC_DEFAULT_WEIGHTS, runCalibration } from '../services/accuracy/calibrator.js';
import { getWeights, loadLearnedWeights, resetWeights } from '../services/matching/confidence-scorer.js';

const log = pino({ name: 'status' });
const router = Router();

/**
 * GET /api/status — System health and metrics.
 *
 * Returns scanner status, sync state, API budgets,
 * exchange rate health, and accuracy metrics.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Run all queries in parallel
    const [
      dealsToday,
      grailsToday,
      totalDeals,
      syncStats,
      exchangeRate,
      accuracyStats,
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM deals WHERE created_at > CURRENT_DATE"),
      pool.query("SELECT COUNT(*) FROM deals WHERE created_at > CURRENT_DATE AND tier = 'GRAIL'"),
      pool.query("SELECT COUNT(*) FROM deals WHERE status = 'active'"),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM cards) as total_cards,
          (SELECT COUNT(*) FROM expansions) as total_expansions,
          (SELECT MAX(last_synced_at) FROM cards) as last_sync
      `),
      pool.query("SELECT rate, fetched_at FROM exchange_rates ORDER BY fetched_at DESC LIMIT 1"),
      getAccuracyStats(),
    ]);

    const ebayBudget = getBudgetStatus();
    const dedupStats = getDedupStats();
    const jobStatuses = getJobStatuses();
    const scannerJob = jobStatuses['ebay-scan'];
    const scannerRunning = scannerJob?.isPaused ? 'paused' : scannerJob?.isRunning ? 'scanning' : 'idle';

    // Fetch Scrydex usage (non-blocking — don't fail status if Scrydex is down)
    let scrydexUsage = null;
    try {
      scrydexUsage = await getAccountUsage();
    } catch {
      // Scrydex API unavailable — return null for usage
    }

    const exchangeRateRow = exchangeRate.rows[0];
    const exchangeRateAge = exchangeRateRow
      ? (Date.now() - new Date(exchangeRateRow.fetched_at).getTime()) / (1000 * 60 * 60)
      : null;

    return res.json({
      scanner: {
        status: scannerRunning,
        isRunning: scannerJob?.isRunning ?? false,
        lastRun: scannerJob?.lastRun ?? null,
        lastError: scannerJob?.lastError ?? null,
        dealsToday: parseInt(dealsToday.rows[0].count),
        grailsToday: parseInt(grailsToday.rows[0].count),
        activeDeals: parseInt(totalDeals.rows[0].count),
        dedupMemorySize: dedupStats.memorySize,
      },
      sync: {
        totalCards: parseInt(syncStats.rows[0].total_cards),
        totalExpansions: parseInt(syncStats.rows[0].total_expansions),
        lastSync: syncStats.rows[0].last_sync,
      },
      ebay: {
        callsToday: ebayBudget.used,
        dailyLimit: ebayBudget.dailyLimit,
        remaining: ebayBudget.remaining,
        status: ebayBudget.remaining > 500 ? 'healthy' : 'low',
      },
      exchangeRate: {
        rate: exchangeRateRow ? parseFloat(exchangeRateRow.rate) : null,
        fetchedAt: exchangeRateRow?.fetched_at || null,
        isStale: exchangeRateAge !== null ? exchangeRateAge > 4 : true,
      },
      accuracy: {
        rolling7d: accuracyStats.rolling7d,
        totalReviewed: accuracyStats.totalReviewed,
        totalCorrect: accuracyStats.totalCorrect,
        totalIncorrect: accuracyStats.totalIncorrect,
        incorrectReasons: accuracyStats.incorrectReasons,
        weightsCalibrated: Object.entries(getWeights()).some(
          ([k, v]) => v !== SPEC_DEFAULT_WEIGHTS[k as keyof typeof SPEC_DEFAULT_WEIGHTS],
        ),
      },
      scrydex: scrydexUsage ? {
        creditsConsumed: scrydexUsage.total_credits_consumed,
        overageConsumed: scrydexUsage.overage_credits_consumed,
        periodEnd: scrydexUsage.period_end,
        status: scrydexUsage.overage_credits_consumed > 0 ? 'critical' : 'healthy',
      } : null,
      jobs: getJobStatuses(),
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch status');
    return res.status(500).json({ error: 'Failed to fetch status' });
  }
});

/**
 * POST /api/status/scanner — Toggle the scanner on/off.
 *
 * Body: { action: 'start' | 'stop' }
 * Persists the paused state to preferences so it survives restarts.
 */
router.post('/scanner', async (req: Request, res: Response) => {
  const { action } = req.body;

  if (action === 'stop') {
    const ok = pauseJob('ebay-scan');
    if (!ok) return res.status(404).json({ error: 'Scanner job not found' });
    await pool.query(
      `INSERT INTO preferences (id, data, updated_at) VALUES (1, '{"scannerPaused":true}', NOW())
       ON CONFLICT (id) DO UPDATE SET data = preferences.data || '{"scannerPaused":true}'::jsonb, updated_at = NOW()`,
    );
    log.info('Scanner paused via API (persisted)');
    return res.json({ status: 'paused' });
  }

  if (action === 'start') {
    const ok = resumeJob('ebay-scan');
    if (!ok) return res.status(404).json({ error: 'Scanner job not found' });
    await pool.query(
      `INSERT INTO preferences (id, data, updated_at) VALUES (1, '{"scannerPaused":false}', NOW())
       ON CONFLICT (id) DO UPDATE SET data = preferences.data || '{"scannerPaused":false}'::jsonb, updated_at = NOW()`,
    );
    log.info('Scanner resumed via API (persisted)');
    return res.json({ status: 'running' });
  }

  return res.status(400).json({ error: 'Invalid action. Use "start" or "stop".' });
});

/**
 * GET /api/status/weights — Current confidence weights and calibration history.
 */
router.get('/weights', async (_req: Request, res: Response) => {
  try {
    const active = getWeights();
    const specDefaults = SPEC_DEFAULT_WEIGHTS;

    // Compute drift from spec for each signal
    const drift: Record<string, number> = {};
    for (const key of Object.keys(specDefaults) as (keyof typeof specDefaults)[]) {
      drift[key] = Math.round((active[key] - specDefaults[key]) * 1000) / 1000;
    }

    // Get last calibration info
    let lastCalibration = null;
    try {
      const { rows } = await pool.query(
        `SELECT * FROM weight_overrides ORDER BY calibrated_at DESC LIMIT 1`,
      );
      if (rows.length > 0) {
        lastCalibration = {
          calibratedAt: rows[0].calibrated_at,
          sampleSize: rows[0].sample_size,
          accuracyBefore: parseFloat(rows[0].accuracy_before),
          accuracyAfter: parseFloat(rows[0].accuracy_after),
          metadata: rows[0].metadata,
        };
      }
    } catch {
      // Table may not exist yet
    }

    return res.json({
      active,
      specDefaults,
      drift,
      isCalibrated: Object.values(drift).some(d => d !== 0),
      lastCalibration,
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch weights');
    return res.status(500).json({ error: 'Failed to fetch weights' });
  }
});

/**
 * POST /api/status/weights/reset — Reset weights to spec defaults.
 */
router.post('/weights/reset', async (_req: Request, res: Response) => {
  resetWeights();
  log.info('Confidence weights reset to spec defaults via API');
  return res.json({ success: true, weights: getWeights() });
});

/**
 * POST /api/status/weights/calibrate — Trigger a calibration run immediately.
 */
router.post('/weights/calibrate', async (_req: Request, res: Response) => {
  try {
    const result = await runCalibration();

    if (result.applied) {
      loadLearnedWeights(result.newWeights as Record<'name' | 'denominator' | 'number' | 'expansion' | 'variant' | 'normalization', number>);
    }

    log.info({ applied: result.applied, reason: result.reason }, 'Manual calibration run');
    return res.json(result);
  } catch (err) {
    log.error({ err }, 'Calibration failed');
    return res.status(500).json({ error: 'Calibration failed' });
  }
});

export default router;
