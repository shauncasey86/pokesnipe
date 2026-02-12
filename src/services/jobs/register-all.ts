import pino from 'pino';
import { registerJob, pauseJob } from './scheduler.js';
import { pool } from '../../db/pool.js';

// Lifecycle
import { expireOldDeals } from '../lifecycle/deal-expiry.js';
import { pruneStaleDeals } from '../lifecycle/deal-pruner.js';

// Scanner
import { runScanCycle } from '../scanner/scanner-service.js';

// Exchange rate
import { refreshRate } from '../exchange-rate/exchange-rate-service.js';

// Sync
import { syncAll } from '../sync/sync-service.js';

// Scrydex client (for expansion detection)
import { getExpansions, getExpansionCards } from '../scrydex/client.js';
import { transformCard, transformVariant } from '../sync/transformers.js';
import { batchUpsertCards, batchUpsertVariants } from '../sync/batch-insert.js';

// Liquidity velocity
import { getVelocity } from '../liquidity/tier3-velocity.js';

// Notifications & accuracy
import { sendAlert } from '../notifications/telegram.js';
import { checkAccuracyThreshold } from '../accuracy/tracker.js';

// Feedback calibration
import { runCalibration, getActiveWeights } from '../accuracy/calibrator.js';
import { loadLearnedWeights } from '../matching/confidence-scorer.js';

// Audit persistence
import { logAuditEvent } from '../audit/log-event.js';

// Helpers
import { getRecentExpansions, checkForNewExpansions, getTopMatchedCards } from './helpers.js';

const log = pino({ name: 'register-jobs' });

const REQUESTED_PAGE_SIZE = 100;

/**
 * Sync all cards for a single expansion by fetching all pages from Scrydex.
 */
async function syncExpansionCards(expansionId: string): Promise<{ cards: number; variants: number }> {
  let page = 1;
  let hasMore = true;
  let totalCards = 0;
  let totalVariants = 0;

  while (hasMore) {
    const response = await getExpansionCards(expansionId, page);

    const cardRows = response.data.map((c) => transformCard(c, expansionId));
    const variantRows = response.data.flatMap((c) =>
      (c.variants || []).map((v) => transformVariant(v, c.id)),
    );

    const cardsUpserted = await batchUpsertCards(cardRows);
    const variantsUpserted = await batchUpsertVariants(variantRows);

    totalCards += cardsUpserted;
    totalVariants += variantsUpserted;

    hasMore = (response.data?.length ?? 0) >= REQUESTED_PAGE_SIZE;
    page++;
  }

  return { cards: totalCards, variants: totalVariants };
}

/**
 * Register all background jobs.
 *
 * Job schedule overview:
 *   Job              | Schedule         | Purpose
 *   -----------------|------------------|--------------------------------------
 *   ebay-scan        | Every 5 min      | Search eBay + create deals
 *   deal-cleanup     | Every hour       | Expire old deals + prune stale
 *   exchange-rate    | Every hour (:30) | Refresh GBP/USD exchange rate
 *   hot-refresh      | Daily at 03:00   | Re-sync 10 most recent expansions
 *   expansion-check  | Daily at 04:00   | Detect and sync new expansions
 *   full-sync        | Weekly Sun 03:00 | Full card database re-sync
 *   velocity-prefetch| Weekly Sun 05:00 | Cache velocity for top 200 cards
 */
export function registerAllJobs(): void {
  log.info('Registering all background jobs');

  // -- Scanner -- every 5 minutes
  registerJob('ebay-scan', '*/5 * * * *', async () => {
    const start = Date.now();
    const result = await runScanCycle();
    const durationMs = Date.now() - start;
    log.info(result, 'Scan cycle result');

    // Only persist to audit log if something happened (avoid filling the table with empty scans)
    if (result.listingsProcessed > 0 || result.dealsCreated > 0 || result.errors > 0) {
      await logAuditEvent({
        syncType: 'ebay_scan',
        status: result.errors > 0 && result.dealsCreated === 0 ? 'failed' : 'completed',
        durationMs,
        metadata: {
          deals_created: result.dealsCreated,
          listings_processed: result.listingsProcessed,
          enrichment_calls: result.enrichmentCalls,
          skipped_duplicate: result.skippedDuplicate,
          skipped_junk: result.skippedJunk,
          skipped_no_match: result.skippedNoMatch,
          skipped_gate: result.skippedGate,
          errors: result.errors,
        },
      }).catch(err => log.warn({ err }, 'Failed to persist scan audit event'));
    }
  });

  // -- Deal cleanup -- every hour at :00
  registerJob('deal-cleanup', '0 * * * *', async () => {
    const start = Date.now();
    const expired = await expireOldDeals();
    const pruned = await pruneStaleDeals();
    const durationMs = Date.now() - start;
    log.info({ expired, pruned }, 'Deal cleanup complete');

    if (expired > 0 || pruned > 0) {
      await logAuditEvent({
        syncType: 'deal_cleanup',
        status: 'completed',
        durationMs,
        metadata: {
          expired,
          pruned,
        },
      }).catch(err => log.warn({ err }, 'Failed to persist cleanup audit event'));
    }
  });

  // -- Exchange rate refresh -- every hour at :30
  registerJob('exchange-rate', '30 * * * *', async () => {
    await refreshRate();
  });

  // -- Hot refresh -- daily at 03:00 (re-sync 10 most recent expansions)
  // Prices for new sets change rapidly. Re-syncing keeps our market prices current.
  registerJob('hot-refresh', '0 3 * * *', async () => {
    const start = Date.now();
    const recent = await getRecentExpansions(10);
    log.info({ count: recent.length, expansions: recent.map(e => e.name) }, 'Starting hot refresh');

    let totalCards = 0;
    let totalVariants = 0;
    for (const exp of recent) {
      try {
        const result = await syncExpansionCards(exp.scrydexId);
        totalCards += result.cards;
        totalVariants += result.variants;
        log.info({ expansion: exp.name, ...result }, 'Hot refresh synced expansion');
      } catch (err) {
        log.error({ err, expansion: exp.name }, 'Hot refresh failed for expansion');
      }
    }

    const durationMs = Date.now() - start;
    log.info({ totalCards, totalVariants, expansions: recent.length }, 'Hot refresh complete');

    await logAuditEvent({
      syncType: 'hot_refresh',
      status: 'completed',
      durationMs,
      expansionsSynced: recent.length,
      cardsUpserted: totalCards,
      variantsUpserted: totalVariants,
      metadata: { expansions: recent.map(e => e.name) },
    }).catch(err => log.warn({ err }, 'Failed to persist hot-refresh audit event'));
  });

  // -- Expansion check -- daily at 04:00 (detect new sets)
  registerJob('expansion-check', '0 4 * * *', async () => {
    const start = Date.now();
    const fetchExpansions = async () => {
      const allExpansions: Array<{ id: string; name: string }> = [];
      let page = 1;
      while (true) {
        const response = await getExpansions(page);
        const items = response.data ?? [];
        allExpansions.push(...items.filter(e => e.language_code === 'EN' && !e.is_online_only).map(e => ({ id: e.id, name: e.name })));
        if (items.length < REQUESTED_PAGE_SIZE) break;
        page++;
      }
      return allExpansions;
    };

    const newExps = await checkForNewExpansions(fetchExpansions);
    let totalCards = 0;
    let totalVariants = 0;
    for (const exp of newExps) {
      try {
        const result = await syncExpansionCards(exp.id);
        totalCards += result.cards;
        totalVariants += result.variants;
        log.info({ expansion: exp.name, ...result }, 'Synced new expansion');
      } catch (err) {
        log.error({ err, expansion: exp.name }, 'Failed to sync new expansion');
      }
    }

    const durationMs = Date.now() - start;
    if (newExps.length > 0) {
      await logAuditEvent({
        syncType: 'expansion_check',
        status: 'completed',
        durationMs,
        expansionsSynced: newExps.length,
        cardsUpserted: totalCards,
        variantsUpserted: totalVariants,
        metadata: { new_expansions: newExps.map(e => e.name) },
      }).catch(err => log.warn({ err }, 'Failed to persist expansion-check audit event'));
    }
  });

  // -- Full sync -- weekly Sunday at 03:00
  registerJob('full-sync', '0 3 * * 0', async () => {
    const result = await syncAll();
    log.info(result, 'Full sync complete');
  });

  // -- Velocity pre-fetch -- weekly Sunday at 05:00
  // Cache sales velocity for the top 200 most-matched cards.
  registerJob('velocity-prefetch', '0 5 * * 0', async () => {
    const topCards = await getTopMatchedCards(200);
    log.info({ count: topCards.length }, 'Starting velocity pre-fetch');

    let fetched = 0;
    for (const card of topCards) {
      try {
        await getVelocity(card.cardId, card.variantName);
        fetched++;
        // Small delay to avoid hammering Scrydex
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        log.warn({ err, cardId: card.cardId }, 'Velocity fetch failed for card');
      }
    }

    log.info({ fetched, total: topCards.length }, 'Velocity pre-fetch complete');
  });

  // -- Accuracy check -- every 6 hours
  registerJob('accuracy-check', '0 */6 * * *', async () => {
    await checkAccuracyThreshold();
  });

  // -- Weight calibration -- daily at 05:00
  // Analyzes reviewed deals to learn which confidence signals best predict
  // correct vs incorrect matches. Adjusts weights if accuracy improves.
  registerJob('weight-calibration', '0 5 * * *', async () => {
    const start = Date.now();
    const result = await runCalibration();
    const durationMs = Date.now() - start;

    log.info({
      applied: result.applied,
      reason: result.reason,
      sampleSize: result.sampleSize,
      accuracyBefore: result.accuracyBefore,
      accuracyAfter: result.accuracyAfter,
    }, 'Weight calibration complete');

    // If calibration produced new weights, hot-load them into the scorer
    if (result.applied) {
      loadLearnedWeights(result.newWeights as Record<'name' | 'denominator' | 'number' | 'expansion' | 'variant' | 'normalization', number>);
    }

    await logAuditEvent({
      syncType: 'weight_calibration',
      status: result.applied ? 'completed' : 'completed',
      durationMs,
      metadata: {
        applied: result.applied,
        reason: result.reason,
        sample_size: result.sampleSize,
        accuracy_before: result.accuracyBefore,
        accuracy_after: result.accuracyAfter,
        old_weights: result.oldWeights,
        new_weights: result.newWeights,
        signal_stats: result.signalStats,
      },
    }).catch(err => log.warn({ err }, 'Failed to persist calibration audit event'));
  });

  // -- Card index staleness check -- every 12 hours
  registerJob('card-index-check', '0 */12 * * *', async () => {
    const lastSync = await pool.query(
      "SELECT MAX(completed_at) as last FROM sync_log WHERE status = 'completed'"
    );
    if (lastSync.rows[0]?.last) {
      const hoursSinceSync = (Date.now() - new Date(lastSync.rows[0].last).getTime()) / (1000 * 60 * 60);
      if (hoursSinceSync > 48) {
        sendAlert('critical', 'Card Index Stale', `Last sync: ${hoursSinceSync.toFixed(0)}h ago`).catch(() => {});
      }
    }
  });

  log.info('All background jobs registered');

  // Restore scanner paused state from preferences (if previously persisted)
  pool.query('SELECT data FROM preferences WHERE id = 1')
    .then(res => {
      if (res.rows[0]?.data?.scannerPaused === true) {
        pauseJob('ebay-scan');
        log.info('Scanner restored to paused state from preferences');
      }
    })
    .catch(err => {
      log.warn({ err }, 'Could not restore scanner state from preferences');
    });

  // Load learned confidence weights from last calibration run
  getActiveWeights()
    .then(weights => {
      loadLearnedWeights(weights);
      log.info({ weights }, 'Loaded confidence weights');
    })
    .catch(err => {
      log.warn({ err }, 'Could not load learned weights, using spec defaults');
    });
}
