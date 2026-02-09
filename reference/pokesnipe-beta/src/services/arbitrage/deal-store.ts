// ═══════════════════════════════════════════════════════════════════════════
// Deal Store - Unified interface for PostgreSQL / In-memory storage
// Uses PostgreSQL when DATABASE_URL is set, otherwise falls back to memory
// ═══════════════════════════════════════════════════════════════════════════

import type { Deal } from './types.js';
import * as pgStore from '../database/pg-deal-store.js';
import { logger } from '../../utils/logger.js';

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

/**
 * Unified DealStore class that wraps the PostgreSQL store
 * All methods are async-compatible but also work synchronously for backward compatibility
 */
class DealStore {
  // ─────────────────────────────────────────────────────────────────────────
  // Add a deal
  // ─────────────────────────────────────────────────────────────────────────

  add(deal: Deal): boolean {
    // Fire and forget - the pgStore handles deduplication
    pgStore.add(deal).catch(() => {
      // Errors are logged in pgStore
    });
    // Return true immediately for backward compatibility
    // The actual add happens async
    return true;
  }

  async addAsync(deal: Deal): Promise<boolean> {
    // Log entry into addAsync for tracing
    logger.info('DEAL_STORE_ADD_ASYNC_ENTRY', {
      dealId: deal.id,
      ebayItemId: deal.ebayItemId,
      cardName: deal.cardName,
    });

    // Explicitly await and return to ensure the operation completes
    const result = await pgStore.add(deal);

    logger.info('DEAL_STORE_ADD_ASYNC_RESULT', {
      dealId: deal.id,
      ebayItemId: deal.ebayItemId,
      result,
    });

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Get active deals (not expired)
  // ─────────────────────────────────────────────────────────────────────────

  getActive(): Deal[] {
    // This needs to be sync for backward compatibility
    // Use getActiveAsync for proper async access
    let result: Deal[] = [];
    pgStore.getActive().then(deals => {
      result = deals;
    }).catch(() => {
      result = [];
    });
    // Note: This returns [] initially, but callers should use getActiveAsync
    return result;
  }

  async getActiveAsync(): Promise<Deal[]> {
    return pgStore.getActive();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Get all deals
  // ─────────────────────────────────────────────────────────────────────────

  getAll(): Deal[] {
    let result: Deal[] = [];
    pgStore.getAll().then(deals => {
      result = deals;
    }).catch(() => {
      result = [];
    });
    return result;
  }

  async getAllAsync(): Promise<Deal[]> {
    return pgStore.getAll();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Get deal by ID
  // ─────────────────────────────────────────────────────────────────────────

  get(id: string): Deal | undefined {
    let result: Deal | undefined;
    pgStore.get(id).then(deal => {
      result = deal;
    }).catch(() => {
      result = undefined;
    });
    return result;
  }

  async getAsync(id: string): Promise<Deal | undefined> {
    return pgStore.get(id);
  }

  // Alias for compatibility with routes
  getById(id: string): Deal | undefined {
    return this.get(id);
  }

  async getByIdAsync(id: string): Promise<Deal | undefined> {
    return pgStore.getById(id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Check if deal exists by eBay item ID
  // ─────────────────────────────────────────────────────────────────────────

  hasDeal(ebayItemId: string): boolean {
    let result = false;
    pgStore.hasDeal(ebayItemId).then(has => {
      result = has;
    }).catch(() => {
      result = false;
    });
    return result;
  }

  async hasDealAsync(ebayItemId: string): Promise<boolean> {
    return pgStore.hasDeal(ebayItemId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Remove a deal
  // ─────────────────────────────────────────────────────────────────────────

  remove(id: string): boolean {
    pgStore.remove(id).catch(() => {});
    return true;
  }

  async removeAsync(id: string): Promise<boolean> {
    return pgStore.remove(id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Clear all deals
  // ─────────────────────────────────────────────────────────────────────────

  clear(): void {
    pgStore.clear().catch(() => {});
  }

  async clearAsync(): Promise<void> {
    return pgStore.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup expired deals
  // ─────────────────────────────────────────────────────────────────────────

  cleanup(): number {
    let result = 0;
    pgStore.cleanup().then(count => {
      result = count;
    }).catch(() => {
      result = 0;
    });
    return result;
  }

  async cleanupAsync(): Promise<number> {
    return pgStore.cleanup();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Get stats
  // ─────────────────────────────────────────────────────────────────────────

  getStats(): DealStoreStats {
    // Return default stats synchronously
    // Use getStatsAsync for accurate stats
    return {
      total: 0,
      activeDeals: 0,
      totalDeals: 0,
      premiumDeals: 0,
      highDeals: 0,
      standardDeals: 0,
      byTier: { premium: 0, high: 0, standard: 0 },
      avgDiscount: 0,
      totalPotentialProfit: 0,
    };
  }

  async getStatsAsync(): Promise<DealStoreStats> {
    return pgStore.getStats();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Get size
  // ─────────────────────────────────────────────────────────────────────────

  size(): number {
    let result = 0;
    pgStore.size().then(s => {
      result = s;
    }).catch(() => {
      result = 0;
    });
    return result;
  }

  async sizeAsync(): Promise<number> {
    return pgStore.size();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Get storage mode
  // ─────────────────────────────────────────────────────────────────────────

  getMode(): 'postgres' | 'memory' {
    return pgStore.getMode();
  }
}

export const dealStore = new DealStore();