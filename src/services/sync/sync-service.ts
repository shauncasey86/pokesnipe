import { pool } from '../../db/pool.js';
import * as scrydex from '../scrydex/client.js';
import { transformExpansion, transformCard, transformVariant } from './transformers.js';
import { batchUpsertExpansions, batchUpsertCards, batchUpsertVariants } from './batch-insert.js';

function log(msg: string): void {
  console.log(`[sync] ${msg}`);
}

function logError(msg: string): void {
  console.error(`[sync] ${msg}`);
}

function memUsage(): string {
  const mem = process.memoryUsage();
  return `rss=${Math.round(mem.rss / 1024 / 1024)}MB heap=${Math.round(mem.heapUsed / 1024 / 1024)}/${Math.round(mem.heapTotal / 1024 / 1024)}MB`;
}

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

function getPageSize(response: { pageSize?: number; page_size?: number }): number {
  return response.pageSize ?? response.page_size ?? 100;
}

function getTotalCount(response: { totalCount?: number; total_count?: number }): number | undefined {
  return response.totalCount ?? response.total_count ?? undefined;
}

async function fetchAllExpansions(): Promise<scrydex.ScrydexExpansion[]> {
  const all: scrydex.ScrydexExpansion[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await scrydex.getExpansions(page);
    const pageSize = getPageSize(response);
    const totalCount = getTotalCount(response);

    if (page === 1) {
      log(`Expansion API page 1: ${response.data.length} items, pageSize=${pageSize}, totalCount=${totalCount}, raw keys=${Object.keys(response).join(',')}`);
    }

    all.push(...response.data);

    // Use totalCount if available, otherwise keep going while we get full pages
    if (totalCount != null) {
      hasMore = page * pageSize < totalCount;
    } else {
      hasMore = response.data.length >= pageSize;
    }
    page++;
  }

  log(`Fetched all expansions: ${all.length} total (${page - 1} pages)`);
  return all;
}

// --- Main sync orchestrator ---

export async function syncAll(): Promise<SyncResult> {
  const logId = await createSyncLogEntry('full_sync');

  try {
    // Step 1: Check credits
    const usage = await scrydex.getAccountUsage();
    log(`Scrydex credits: ${usage.remaining_credits} remaining of ${usage.total_credits}`);

    // Step 2: Fetch all expansions (paginated)
    const allExpansions = await fetchAllExpansions();

    // Filter to English only, exclude online-only
    const englishExpansions = allExpansions.filter(
      (e) => e.language_code === 'EN' && !e.is_online_only,
    );
    log(`Filtered: ${allExpansions.length} total → ${englishExpansions.length} English non-online`);

    // Step 3: Upsert expansions
    const expansionRows = englishExpansions.map((e) => transformExpansion(e));
    const expansionsUpserted = await batchUpsertExpansions(expansionRows);
    log(`Expansions upserted: ${expansionsUpserted} | ${memUsage()}`);

    // Step 4: For each expansion, fetch all card pages
    let totalCards = 0;
    let totalVariants = 0;

    for (let ei = 0; ei < englishExpansions.length; ei++) {
      const expansion = englishExpansions[ei];
      let page = 1;
      let hasMore = true;
      let expansionCards = 0;
      let expansionVariants = 0;

      try {
        while (hasMore) {
          const response = await scrydex.getExpansionCards(expansion.id, page);

          const cardRows = response.data.map((c) => transformCard(c, expansion.id));
          const variantRows = response.data.flatMap((c) =>
            (c.variants || []).map((v) => transformVariant(v, c.id)),
          );

          const cardsUpserted = await batchUpsertCards(cardRows);
          const variantsUpserted = await batchUpsertVariants(variantRows);

          totalCards += cardsUpserted;
          totalVariants += variantsUpserted;
          expansionCards += cardsUpserted;
          expansionVariants += variantsUpserted;

          const cardTotalCount = getTotalCount(response);
          const cardPageSize = getPageSize(response);
          if (cardTotalCount != null) {
            hasMore = page * cardPageSize < cardTotalCount;
          } else {
            hasMore = response.data.length >= cardPageSize;
          }
          page++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : '';
        logError(`EXPANSION FAILED [${ei + 1}/${englishExpansions.length}]: ${expansion.name} (${expansion.id}) page=${page}`);
        logError(`ERROR: ${msg}`);
        logError(`STACK: ${stack}`);
        throw err;
      }

      log(`[${ei + 1}/${englishExpansions.length}] ${expansion.name}: ${expansionCards} cards, ${expansionVariants} variants | ${memUsage()}`);
    }

    // Step 5: Update sync_log
    await completeSyncLog(logId, {
      expansions_synced: expansionsUpserted,
      cards_upserted: totalCards,
      variants_upserted: totalVariants,
    });

    log(`SYNC COMPLETE: ${expansionsUpserted} expansions, ${totalCards} cards, ${totalVariants} variants`);

    return { expansions: expansionsUpserted, cards: totalCards, variants: totalVariants };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    logError(`syncAll FAILED: ${message}`);
    logError(`Stack: ${stack}`);
    await failSyncLog(logId, message).catch(() => {});
    throw error;
  }
}
