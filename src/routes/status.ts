import { Router, Request, Response } from 'express';
import pino from 'pino';
import { pool } from '../db/pool.js';
import { getBudgetStatus } from '../services/ebay/budget.js';
import { getDedupStats } from '../services/scanner/deduplicator.js';
import { getJobStatuses, pauseJob, resumeJob } from '../services/jobs/index.js';
import { getAccuracyStats } from '../services/accuracy/tracker.js';
import { getAccountUsage } from '../services/scrydex/client.js';

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
 */
router.post('/scanner', (req: Request, res: Response) => {
  const { action } = req.body;

  if (action === 'stop') {
    const ok = pauseJob('ebay-scan');
    if (!ok) return res.status(404).json({ error: 'Scanner job not found' });
    log.info('Scanner paused via API');
    return res.json({ status: 'paused' });
  }

  if (action === 'start') {
    const ok = resumeJob('ebay-scan');
    if (!ok) return res.status(404).json({ error: 'Scanner job not found' });
    log.info('Scanner resumed via API');
    return res.json({ status: 'running' });
  }

  return res.status(400).json({ error: 'Invalid action. Use "start" or "stop".' });
});

export default router;
