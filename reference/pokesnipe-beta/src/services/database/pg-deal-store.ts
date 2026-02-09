// src/services/database/pg-deal-store.ts
// ═══════════════════════════════════════════════════════════════════════════
// PostgreSQL Deal Store - Persistent storage for Railway deployment
// Falls back to in-memory store when PostgreSQL is unavailable
// ═══════════════════════════════════════════════════════════════════════════

import { query, isConnected } from './postgres.js';
import type { Deal } from '../arbitrage/types.js';
import { logger } from '../../utils/logger.js';
import { telegramService } from '../telegram/index.js';

interface DealRow {
  id: string;
  ebay_item_id: string;
  ebay_url: string;
  affiliate_url: string | null;
  title: string;
  image_url: string | null;
  scrydex_image_url: string | null;
  card_id: string | null;
  card_name: string | null;
  card_number: string | null;
  expansion_id: string | null;
  expansion_name: string | null;
  expansion_logo: string | null;
  expansion_symbol: string | null;
  ebay_price_gbp: string;
  shipping_gbp: string;
  total_cost_gbp: string;
  market_value_usd: string | null;
  market_value_gbp: string | null;
  exchange_rate: string | null;
  profit_gbp: string | null;
  discount_percent: string | null;
  tier: string;
  is_graded: boolean;
  grading_company: string | null;
  grade: string | null;
  raw_condition: string | null;
  detected_variant: string | null;
  ebay_condition: string | null;
  ebay_condition_id: string | null;
  condition_source: string | null;
  seller_name: string | null;
  seller_feedback: number | null;
  seller_feedback_percent: string | null;
  item_location: string | null;
  item_country: string | null;
  found_at: Date;
  listing_time: Date | null;
  expires_at: Date;
  match_confidence: number | null;
  match_type: string | null;
  match_details: Record<string, unknown> | null;
  scrydex_card: Record<string, unknown> | null;
  all_prices: unknown[] | null | undefined;
  [key: string]: unknown;
}

interface DealStoreStats {
  total: number;
  activeDeals: number;
  totalDeals: number;
  premiumDeals: number;
  highDeals: number;
  standardDeals: number;
  byTier: {
    premium: number;
    high: number;
    standard: number;
  };
  avgDiscount: number;
  totalPotentialProfit: number;
}

// In-memory fallback store
const memoryStore = new Map<string, Deal>();
const MAX_MEMORY_DEALS = 500;
const DEAL_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function rowToDeal(row: DealRow): Deal {
  return {
    id: row.id,
    ebayItemId: row.ebay_item_id,
    ebayUrl: row.ebay_url,
    affiliateUrl: row.affiliate_url || row.ebay_url,
    title: row.title,
    imageUrl: row.image_url,
    scrydexImageUrl: row.scrydex_image_url,

    cardId: row.card_id || '',
    cardName: row.card_name || '',
    cardNumber: row.card_number || '',
    expansionId: row.expansion_id || '',
    expansionName: row.expansion_name || '',
    expansion: row.expansion_name || '',
    expansionLogo: row.expansion_logo,
    expansionSymbol: row.expansion_symbol,

    ebayPrice: parseFloat(row.ebay_price_gbp) || 0,
    ebayPriceGBP: parseFloat(row.ebay_price_gbp) || 0,
    shippingCost: parseFloat(row.shipping_gbp) || 0,
    shippingGBP: parseFloat(row.shipping_gbp) || 0,
    totalCost: parseFloat(row.total_cost_gbp) || 0,
    totalCostGBP: parseFloat(row.total_cost_gbp) || 0,
    marketValueUSD: parseFloat(row.market_value_usd || '0') || 0,
    marketValueGBP: parseFloat(row.market_value_gbp || '0') || 0,
    exchangeRate: parseFloat(row.exchange_rate || '0') || 0,
    profitGBP: parseFloat(row.profit_gbp || '0') || 0,
    profitPercent: parseFloat(row.discount_percent || '0') || 0,
    discountPercent: parseFloat(row.discount_percent || '0') || 0,

    tier: row.tier as 'PREMIUM' | 'HIGH' | 'STANDARD',
    isGraded: row.is_graded,
    gradingCompany: row.grading_company,
    grade: row.grade,
    rawCondition: row.raw_condition,
    condition: row.raw_condition,
    variant: row.detected_variant,
    detectedVariant: row.detected_variant,

    // eBay condition from item specifics
    ebayCondition: row.ebay_condition,
    ebayConditionId: row.ebay_condition_id,
    conditionSource: (row.condition_source as 'condition_descriptor' | 'item_specifics' | 'title' | 'default') || 'default',

    seller: row.seller_name,
    sellerName: row.seller_name,
    sellerFeedback: row.seller_feedback,
    sellerFeedbackPercent: row.seller_feedback_percent
      ? parseFloat(row.seller_feedback_percent)
      : null,

    itemLocation: row.item_location,
    itemCountry: row.item_country,

    foundAt: row.found_at,
    discoveredAt: row.found_at,
    listingTime: row.listing_time || undefined,
    expiresAt: row.expires_at,

    matchConfidence: row.match_confidence || 0,
    matchType: row.match_type || '',
    matchDetails: row.match_details as Deal['matchDetails'],
    scrydexCard: row.scrydex_card,
    allPrices: row.all_prices ?? undefined,
  };
}

function dealToRow(deal: Deal): Partial<DealRow> {
  const foundAt = deal.foundAt instanceof Date ? deal.foundAt : new Date(deal.foundAt);
  const expiresAt = deal.expiresAt instanceof Date ? deal.expiresAt : new Date(deal.expiresAt);
  const listingTime = deal.listingTime
    ? (deal.listingTime instanceof Date ? deal.listingTime : new Date(deal.listingTime))
    : null;

  return {
    id: deal.id,
    ebay_item_id: deal.ebayItemId,
    ebay_url: deal.ebayUrl,
    affiliate_url: deal.affiliateUrl,
    title: deal.title,
    image_url: deal.imageUrl,
    scrydex_image_url: deal.scrydexImageUrl,

    card_id: deal.cardId,
    card_name: deal.cardName,
    card_number: deal.cardNumber,
    expansion_id: deal.expansionId,
    expansion_name: deal.expansionName || deal.expansion,
    expansion_logo: deal.expansionLogo as string | undefined,
    expansion_symbol: deal.expansionSymbol as string | undefined,

    ebay_price_gbp: (deal.ebayPriceGBP || deal.ebayPrice || 0).toString(),
    shipping_gbp: (deal.shippingGBP || deal.shippingCost || 0).toString(),
    total_cost_gbp: (deal.totalCostGBP || deal.totalCost || 0).toString(),
    market_value_usd: deal.marketValueUSD?.toString(),
    market_value_gbp: deal.marketValueGBP?.toString(),
    exchange_rate: deal.exchangeRate?.toString(),
    profit_gbp: deal.profitGBP?.toString(),
    discount_percent: deal.discountPercent?.toString(),

    tier: deal.tier,
    is_graded: deal.isGraded,
    grading_company: deal.gradingCompany,
    grade: deal.grade,
    raw_condition: deal.rawCondition || deal.condition,
    detected_variant: deal.detectedVariant || deal.variant,

    ebay_condition: (deal as Deal & { ebayCondition?: string }).ebayCondition || null,
    ebay_condition_id: (deal as Deal & { ebayConditionId?: string }).ebayConditionId || null,
    condition_source: deal.conditionSource || 'default',

    seller_name: deal.sellerName || deal.seller,
    seller_feedback: deal.sellerFeedback,
    seller_feedback_percent: deal.sellerFeedbackPercent?.toString(),

    item_location: deal.itemLocation,
    item_country: deal.itemCountry,

    found_at: foundAt,
    listing_time: listingTime,
    expires_at: expiresAt,

    match_confidence: deal.matchConfidence,
    match_type: deal.matchType,
    match_details: deal.matchDetails as Record<string, unknown> | undefined,
    scrydex_card: deal.scrydexCard as Record<string, unknown> | undefined,
    all_prices: deal.allPrices as unknown[] | undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function add(deal: Deal): Promise<boolean> {
  // Log entry into add function for debugging
  logger.info('PG_DEAL_ADD_ENTRY', {
    dealId: deal.id,
    ebayItemId: deal.ebayItemId,
    cardName: deal.cardName,
  });

  // Check for duplicate
  let isDuplicate = false;
  try {
    isDuplicate = await hasDeal(deal.ebayItemId);
  } catch (dupError) {
    logger.error('PG_DEAL_DUPLICATE_CHECK_ERROR', {
      ebayItemId: deal.ebayItemId,
      error: dupError instanceof Error ? dupError.message : 'Unknown',
    });
    // Continue with insert attempt - let the unique constraint catch actual duplicates
  }

  if (isDuplicate) {
    logger.info('PG_DEAL_DUPLICATE', { ebayItemId: deal.ebayItemId });
    return false;
  }

  const connected = isConnected();
  logger.info('PG_DEAL_ADD_START', {
    dealId: deal.id,
    ebayItemId: deal.ebayItemId,
    cardName: deal.cardName,
    pgConnected: connected,
  });

  if (connected) {
    try {
      const row = dealToRow(deal);

      await query(
        `INSERT INTO deals (
          id, ebay_item_id, ebay_url, affiliate_url, title, image_url, scrydex_image_url,
          card_id, card_name, card_number, expansion_id, expansion_name,
          expansion_logo, expansion_symbol,
          ebay_price_gbp, shipping_gbp, total_cost_gbp,
          market_value_usd, market_value_gbp, exchange_rate,
          profit_gbp, discount_percent,
          tier, is_graded, grading_company, grade, raw_condition, detected_variant,
          ebay_condition, ebay_condition_id, condition_source,
          seller_name, seller_feedback, seller_feedback_percent,
          item_location, item_country,
          found_at, listing_time, expires_at,
          match_confidence, match_type, match_details,
          scrydex_card, all_prices
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14,
          $15, $16, $17,
          $18, $19, $20,
          $21, $22,
          $23, $24, $25, $26, $27, $28,
          $29, $30, $31,
          $32, $33, $34,
          $35, $36,
          $37, $38, $39,
          $40, $41, $42,
          $43, $44
        )`,
        [
          row.id, row.ebay_item_id, row.ebay_url, row.affiliate_url, row.title, row.image_url, row.scrydex_image_url,
          row.card_id, row.card_name, row.card_number, row.expansion_id, row.expansion_name,
          row.expansion_logo, row.expansion_symbol,
          row.ebay_price_gbp, row.shipping_gbp, row.total_cost_gbp,
          row.market_value_usd, row.market_value_gbp, row.exchange_rate,
          row.profit_gbp, row.discount_percent,
          row.tier, row.is_graded, row.grading_company, row.grade, row.raw_condition, row.detected_variant,
          row.ebay_condition, row.ebay_condition_id, row.condition_source,
          row.seller_name, row.seller_feedback, row.seller_feedback_percent,
          row.item_location, row.item_country,
          row.found_at, row.listing_time, row.expires_at,
          row.match_confidence, row.match_type, JSON.stringify(row.match_details),
          JSON.stringify(row.scrydex_card), JSON.stringify(row.all_prices),
        ]
      );

      // Verify the deal was actually inserted by querying it back
      const verifyResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM deals WHERE id = $1`,
        [deal.id]
      );
      const wasInserted = parseInt(verifyResult.rows[0]?.count || '0', 10) > 0;

      if (wasInserted) {
        logger.info('PG_DEAL_ADDED', { id: deal.id, ebayItemId: deal.ebayItemId, verified: true });

        // Send Telegram alert for new deal (fire and forget)
        telegramService.sendDealAlert(deal).catch((err) => {
          logger.error('TELEGRAM_ALERT_ERROR', {
            dealId: deal.id,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        });

        return true;
      } else {
        logger.error('PG_DEAL_INSERT_NOT_VERIFIED', {
          dealId: deal.id,
          ebayItemId: deal.ebayItemId,
          message: 'INSERT succeeded but deal not found in database',
        });
        // Fall through to memory store
      }
    } catch (err) {
      logger.error('PG_DEAL_ADD_ERROR', {
        error: err instanceof Error ? err.message : 'Unknown',
        dealId: deal.id,
        stack: err instanceof Error ? err.stack : undefined,
      });
      // Fall through to memory store
    }
  }

  // Memory fallback
  logger.info('PG_DEAL_MEMORY_FALLBACK', {
    dealId: deal.id,
    ebayItemId: deal.ebayItemId,
    cardName: deal.cardName,
    memoryStoreSize: memoryStore.size,
  });

  if (memoryStore.size >= MAX_MEMORY_DEALS) {
    memoryCleanup();
    if (memoryStore.size >= MAX_MEMORY_DEALS) {
      const oldestKey = memoryStore.keys().next().value;
      if (oldestKey) memoryStore.delete(oldestKey);
    }
  }

  memoryStore.set(deal.id, deal);
  logger.debug('PG_DEAL_MEMORY_ADDED', {
    dealId: deal.id,
    newStoreSize: memoryStore.size,
  });

  // Send Telegram alert for new deal (fire and forget)
  telegramService.sendDealAlert(deal).catch((err) => {
    logger.error('TELEGRAM_ALERT_ERROR', {
      dealId: deal.id,
      error: err instanceof Error ? err.message : 'Unknown',
    });
  });

  return true;
}

export async function getActive(): Promise<Deal[]> {
  const connected = isConnected();

  if (connected) {
    try {
      const result = await query<DealRow>(
        `SELECT * FROM deals
         WHERE expires_at > NOW()
         ORDER BY found_at DESC`
      );
      logger.debug('PG_GET_ACTIVE_SUCCESS', {
        count: result.rows.length,
        source: 'postgres',
      });
      return result.rows.map(rowToDeal);
    } catch (err) {
      logger.error('PG_GET_ACTIVE_ERROR', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  // Memory fallback
  const now = Date.now();
  const active: Deal[] = [];

  for (const deal of memoryStore.values()) {
    const foundTime = deal.foundAt instanceof Date ? deal.foundAt.getTime() : new Date(deal.foundAt).getTime();
    if (now - foundTime < DEAL_EXPIRY_MS) {
      active.push(deal);
    }
  }

  logger.debug('PG_GET_ACTIVE_MEMORY', {
    memoryStoreSize: memoryStore.size,
    activeCount: active.length,
    pgConnected: connected,
    source: 'memory',
  });

  return active.sort((a, b) => {
    const timeA = a.foundAt instanceof Date ? a.foundAt.getTime() : new Date(a.foundAt).getTime();
    const timeB = b.foundAt instanceof Date ? b.foundAt.getTime() : new Date(b.foundAt).getTime();
    return timeB - timeA;
  });
}

export async function getAll(): Promise<Deal[]> {
  if (isConnected()) {
    try {
      const result = await query<DealRow>(
        `SELECT * FROM deals ORDER BY found_at DESC`
      );
      return result.rows.map(rowToDeal);
    } catch (err) {
      logger.error('PG_GET_ALL_ERROR', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  return Array.from(memoryStore.values());
}

export async function get(id: string): Promise<Deal | undefined> {
  if (isConnected()) {
    try {
      const result = await query<DealRow>(
        `SELECT * FROM deals WHERE id = $1`,
        [id]
      );
      if (result.rows.length > 0) {
        return rowToDeal(result.rows[0]);
      }
      return undefined;
    } catch (err) {
      logger.error('PG_GET_ERROR', {
        error: err instanceof Error ? err.message : 'Unknown',
        id,
      });
    }
  }

  return memoryStore.get(id);
}

export async function getById(id: string): Promise<Deal | undefined> {
  return get(id);
}

export async function hasDeal(ebayItemId: string): Promise<boolean> {
  if (isConnected()) {
    try {
      const result = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM deals WHERE ebay_item_id = $1`,
        [ebayItemId]
      );
      return parseInt(result.rows[0].count, 10) > 0;
    } catch (err) {
      logger.error('PG_HAS_DEAL_ERROR', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  for (const deal of memoryStore.values()) {
    if (deal.ebayItemId === ebayItemId) {
      return true;
    }
  }
  return false;
}

export async function remove(id: string): Promise<boolean> {
  if (isConnected()) {
    try {
      const result = await query(
        `DELETE FROM deals WHERE id = $1`,
        [id]
      );
      return (result.rowCount || 0) > 0;
    } catch (err) {
      logger.error('PG_REMOVE_ERROR', {
        error: err instanceof Error ? err.message : 'Unknown',
        id,
      });
    }
  }

  return memoryStore.delete(id);
}

export async function clear(): Promise<void> {
  if (isConnected()) {
    try {
      await query(`TRUNCATE TABLE deals`);
      logger.info('PG_DEALS_CLEARED');
    } catch (err) {
      logger.error('PG_CLEAR_ERROR', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  memoryStore.clear();
}

export async function cleanup(): Promise<number> {
  if (isConnected()) {
    try {
      const result = await query(
        `DELETE FROM deals WHERE expires_at <= NOW()`
      );
      const count = result.rowCount || 0;
      if (count > 0) {
        logger.info('PG_DEALS_CLEANED', { count });
      }
      return count;
    } catch (err) {
      logger.error('PG_CLEANUP_ERROR', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  return memoryCleanup();
}

function memoryCleanup(): number {
  const now = Date.now();
  let removed = 0;

  for (const [id, deal] of memoryStore) {
    const dealTime = deal.foundAt instanceof Date ? deal.foundAt.getTime() : new Date(deal.foundAt).getTime();
    if (now - dealTime >= DEAL_EXPIRY_MS) {
      memoryStore.delete(id);
      removed++;
    }
  }

  return removed;
}

export async function getStats(): Promise<DealStoreStats> {
  if (isConnected()) {
    try {
      const [totalResult, activeResult, tierResult, profitResult] = await Promise.all([
        query<{ count: string }>(`SELECT COUNT(*) as count FROM deals`),
        query<{ count: string }>(`SELECT COUNT(*) as count FROM deals WHERE expires_at > NOW()`),
        query<{ tier: string; count: string }>(
          `SELECT tier, COUNT(*) as count FROM deals WHERE expires_at > NOW() GROUP BY tier`
        ),
        query<{ avg_discount: string; total_profit: string }>(
          `SELECT
            COALESCE(AVG(discount_percent), 0) as avg_discount,
            COALESCE(SUM(profit_gbp), 0) as total_profit
           FROM deals WHERE expires_at > NOW()`
        ),
      ]);

      const tierCounts = { premium: 0, high: 0, standard: 0 };
      for (const row of tierResult.rows) {
        const tier = row.tier.toLowerCase() as keyof typeof tierCounts;
        if (tier in tierCounts) {
          tierCounts[tier] = parseInt(row.count, 10);
        }
      }

      return {
        total: parseInt(totalResult.rows[0].count, 10),
        activeDeals: parseInt(activeResult.rows[0].count, 10),
        totalDeals: parseInt(totalResult.rows[0].count, 10),
        premiumDeals: tierCounts.premium,
        highDeals: tierCounts.high,
        standardDeals: tierCounts.standard,
        byTier: tierCounts,
        avgDiscount: parseFloat(profitResult.rows[0].avg_discount) || 0,
        totalPotentialProfit: parseFloat(profitResult.rows[0].total_profit) || 0,
      };
    } catch (err) {
      logger.error('PG_GET_STATS_ERROR', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  // Memory fallback stats
  const active = await getActive();
  const tierCounts = { premium: 0, high: 0, standard: 0 };
  let totalDiscount = 0;
  let totalProfit = 0;

  for (const deal of active) {
    totalDiscount += deal.discountPercent;
    totalProfit += deal.profitGBP;

    const tier = deal.tier.toLowerCase() as keyof typeof tierCounts;
    if (tier in tierCounts) {
      tierCounts[tier]++;
    }
  }

  return {
    total: memoryStore.size,
    activeDeals: active.length,
    totalDeals: memoryStore.size,
    premiumDeals: tierCounts.premium,
    highDeals: tierCounts.high,
    standardDeals: tierCounts.standard,
    byTier: tierCounts,
    avgDiscount: active.length > 0 ? totalDiscount / active.length : 0,
    totalPotentialProfit: totalProfit,
  };
}

export async function size(): Promise<number> {
  if (isConnected()) {
    try {
      const result = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM deals`
      );
      return parseInt(result.rows[0].count, 10);
    } catch (err) {
      logger.error('PG_SIZE_ERROR', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  return memoryStore.size;
}

export function getMode(): 'postgres' | 'memory' {
  return isConnected() ? 'postgres' : 'memory';
}

// ─────────────────────────────────────────────────────────────────────────────
// Scanner stats operations
// ─────────────────────────────────────────────────────────────────────────────

export async function updateDailyStats(stats: {
  scansCompleted?: number;
  listingsProcessed?: number;
  dealsFound?: number;
  creditsUsed?: number;
  premiumDeals?: number;
  highDeals?: number;
  standardDeals?: number;
}): Promise<void> {
  if (!isConnected()) return;

  try {
    await query(
      `INSERT INTO scanner_stats (date, scans_completed, listings_processed, deals_found, credits_used, premium_deals, high_deals, standard_deals)
       VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (date) DO UPDATE SET
         scans_completed = scanner_stats.scans_completed + EXCLUDED.scans_completed,
         listings_processed = scanner_stats.listings_processed + EXCLUDED.listings_processed,
         deals_found = scanner_stats.deals_found + EXCLUDED.deals_found,
         credits_used = scanner_stats.credits_used + EXCLUDED.credits_used,
         premium_deals = scanner_stats.premium_deals + EXCLUDED.premium_deals,
         high_deals = scanner_stats.high_deals + EXCLUDED.high_deals,
         standard_deals = scanner_stats.standard_deals + EXCLUDED.standard_deals`,
      [
        stats.scansCompleted || 0,
        stats.listingsProcessed || 0,
        stats.dealsFound || 0,
        stats.creditsUsed || 0,
        stats.premiumDeals || 0,
        stats.highDeals || 0,
        stats.standardDeals || 0,
      ]
    );
  } catch (err) {
    logger.error('PG_UPDATE_STATS_ERROR', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }
}

export async function getDailyStats(date?: Date): Promise<{
  scansCompleted: number;
  listingsProcessed: number;
  dealsFound: number;
  creditsUsed: number;
  premiumDeals: number;
  highDeals: number;
  standardDeals: number;
} | null> {
  if (!isConnected()) return null;

  try {
    const result = await query<{
      scans_completed: number;
      listings_processed: number;
      deals_found: number;
      credits_used: number;
      premium_deals: number;
      high_deals: number;
      standard_deals: number;
    }>(
      `SELECT * FROM scanner_stats WHERE date = $1`,
      [date || new Date()]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      scansCompleted: row.scans_completed,
      listingsProcessed: row.listings_processed,
      dealsFound: row.deals_found,
      creditsUsed: row.credits_used,
      premiumDeals: row.premium_deals,
      highDeals: row.high_deals,
      standardDeals: row.standard_deals,
    };
  } catch (err) {
    logger.error('PG_GET_DAILY_STATS_ERROR', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return null;
  }
}
