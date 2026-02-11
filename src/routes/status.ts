import { Router, Request, Response } from 'express';
import pino from 'pino';
import { pool } from '../db/pool.js';
import { getBudgetStatus } from '../services/ebay/budget.js';
import { getDedupStats } from '../services/scanner/deduplicator.js';
import { getJobStatuses, pauseJob, resumeJob } from '../services/jobs/index.js';

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
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE reviewed_at > NOW() - INTERVAL '7 days') as reviewed_7d,
          COUNT(*) FILTER (WHERE reviewed_at > NOW() - INTERVAL '7 days' AND is_correct_match = true) as correct_7d,
          COUNT(*) FILTER (WHERE is_correct_match IS NOT NULL) as total_reviewed,
          COUNT(*) FILTER (WHERE is_correct_match = true) as total_correct
        FROM deals
        WHERE status = 'reviewed'
      `),
    ]);

    const ebayBudget = getBudgetStatus();
    const dedupStats = getDedupStats();
    const jobStatuses = getJobStatuses();
    const scannerJob = jobStatuses['ebay-scan'];
    const scannerRunning = scannerJob?.isPaused ? 'paused' : 'running';

    const exchangeRateRow = exchangeRate.rows[0];
    const exchangeRateAge = exchangeRateRow
      ? (Date.now() - new Date(exchangeRateRow.fetched_at).getTime()) / (1000 * 60 * 60)
      : null;

    const accuracy = accuracyStats.rows[0];
    const reviewed7d = parseInt(accuracy.reviewed_7d) || 0;
    const correct7d = parseInt(accuracy.correct_7d) || 0;

    return res.json({
      scanner: {
        status: scannerRunning,
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
        rolling7d: reviewed7d > 0 ? Math.round((correct7d / reviewed7d) * 1000) / 10 : null,
        totalReviewed: parseInt(accuracy.total_reviewed) || 0,
        totalCorrect: parseInt(accuracy.total_correct) || 0,
      },
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
