import pino from 'pino';
import { registerJob } from './scheduler.js';
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
    const result = await runScanCycle();
    log.info(result, 'Scan cycle result');
  });

  // -- Deal cleanup -- every hour at :00
  registerJob('deal-cleanup', '0 * * * *', async () => {
    const expired = await expireOldDeals();
    const pruned = await pruneStaleDeals();
    log.info({ expired, pruned }, 'Deal cleanup complete');
  });

  // -- Exchange rate refresh -- every hour at :30
  registerJob('exchange-rate', '30 * * * *', async () => {
    await refreshRate();
  });

  // -- Hot refresh -- daily at 03:00 (re-sync 10 most recent expansions)
  // Prices for new sets change rapidly. Re-syncing keeps our market prices current.
  registerJob('hot-refresh', '0 3 * * *', async () => {
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

    log.info({ totalCards, totalVariants, expansions: recent.length }, 'Hot refresh complete');
  });

  // -- Expansion check -- daily at 04:00 (detect new sets)
  registerJob('expansion-check', '0 4 * * *', async () => {
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
    for (const exp of newExps) {
      try {
        const result = await syncExpansionCards(exp.id);
        log.info({ expansion: exp.name, ...result }, 'Synced new expansion');
      } catch (err) {
        log.error({ err, expansion: exp.name }, 'Failed to sync new expansion');
      }
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
}
