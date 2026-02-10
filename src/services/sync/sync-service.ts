import pino from 'pino';
import { pool } from '../../db/pool.js';
import * as scrydex from '../scrydex/client.js';
import { transformExpansion, transformCard, transformVariant } from './transformers.js';
import { batchUpsertExpansions, batchUpsertCards, batchUpsertVariants } from './batch-insert.js';

const logger = pino({ name: 'sync' });

export interface SyncResult {
  expansions: number;
  cards: number;
  variants: number;
}

// --- Sync log helpers ---

async function createSyncLogEntry(syncType: string): Promise<number> {
  const result = await pool.query(
    `INSERT INTO sync_log (sync_type, status) VALUES ($1, 'running') RETURNING id`,
    [syncType],
  );
  return result.rows[0].id;
}

async function completeSyncLog(
  id: number,
  counts: { expansions_synced: number; cards_upserted: number; variants_upserted: number },
): Promise<void> {
  await pool.query(
    `UPDATE sync_log SET status='completed', completed_at=NOW(), expansions_synced=$1, cards_upserted=$2, variants_upserted=$3 WHERE id=$4`,
    [counts.expansions_synced, counts.cards_upserted, counts.variants_upserted, id],
  );
}

async function failSyncLog(id: number, errorMessage: string): Promise<void> {
  await pool.query(
    `UPDATE sync_log SET status='failed', completed_at=NOW(), error_message=$1 WHERE id=$2`,
    [errorMessage, id],
  );
}

// --- Fetch all pages of expansions ---

async function fetchAllExpansions(): Promise<scrydex.ScrydexExpansion[]> {
  const all: scrydex.ScrydexExpansion[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await scrydex.getExpansions(page);
    all.push(...response.data);
    hasMore = page * response.pageSize < response.totalCount;
    page++;
  }

  logger.info({ total: all.length }, 'Fetched all expansions');
  return all;
}

// --- Main sync orchestrator ---

export async function syncAll(): Promise<SyncResult> {
  const logId = await createSyncLogEntry('full_sync');

  try {
    // Step 1: Check credits
    const usage = await scrydex.getAccountUsage();
    logger.info({ remainingCredits: usage.remaining_credits }, 'Scrydex credits check');

    // Step 2: Fetch all expansions (paginated)
    const allExpansions = await fetchAllExpansions();

    // Filter to English only, exclude online-only
    const englishExpansions = allExpansions.filter(
      (e) => e.language_code === 'EN' && !e.is_online_only,
    );
    logger.info(
      { total: allExpansions.length, english: englishExpansions.length },
      'Filtered expansions',
    );

    // Step 3: Upsert expansions
    const expansionRows = englishExpansions.map(transformExpansion);
    const expansionsUpserted = await batchUpsertExpansions(expansionRows);
    logger.info({ expansionsUpserted }, 'Expansions upserted');

    // Step 4: For each expansion, fetch all card pages
    let totalCards = 0;
    let totalVariants = 0;

    for (const expansion of englishExpansions) {
      let page = 1;
      let hasMore = true;
      let expansionCards = 0;
      let expansionVariants = 0;

      while (hasMore) {
        const response = await scrydex.getExpansionCards(expansion.id, page);

        // Transform cards and variants
        const cardRows = response.data.map((c) => transformCard(c, expansion.id));
        const variantRows = response.data.flatMap((c) =>
          (c.variants || []).map((v) => transformVariant(v, c.id)),
        );

        // Batch upsert
        const cardsUpserted = await batchUpsertCards(cardRows);
        const variantsUpserted = await batchUpsertVariants(variantRows);

        totalCards += cardsUpserted;
        totalVariants += variantsUpserted;
        expansionCards += cardsUpserted;
        expansionVariants += variantsUpserted;

        // Check if more pages
        hasMore = page * 100 < response.totalCount;
        page++;
      }

      logger.info(
        { expansion: expansion.name, cards: expansionCards, variants: expansionVariants },
        'Expansion synced',
      );
    }

    // Step 5: Update sync_log
    await completeSyncLog(logId, {
      expansions_synced: expansionsUpserted,
      cards_upserted: totalCards,
      variants_upserted: totalVariants,
    });

    logger.info(
      { expansions: expansionsUpserted, cards: totalCards, variants: totalVariants },
      'Sync completed',
    );

    return { expansions: expansionsUpserted, cards: totalCards, variants: totalVariants };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failSyncLog(logId, message);
    throw error;
  }
}
