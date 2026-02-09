// src/utils/scan-activity.ts
// ═══════════════════════════════════════════════════════════════════════════
// Scan Activity Logger - Detailed activity tracking for the web dashboard
// Logs search queries, matches, and deals for each scan
// ═══════════════════════════════════════════════════════════════════════════

export type ActivityLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';

export interface ScanActivityEntry {
  timestamp: string;
  time: string; // HH:MM:SS format for display
  level: ActivityLevel;
  message: string;
  details?: {
    query?: string;
    listingsFetched?: number;
    listingsProcessed?: number;
    cardsMatched?: number;
    dealsFound?: number;
    durationMs?: number;
    errors?: string[];
  };
}

class ScanActivityLogger {
  private activities: ScanActivityEntry[] = [];
  private readonly MAX_ENTRIES = 500;

  /**
   * Add a simple log entry
   */
  log(message: string, level: ActivityLevel = 'INFO'): void {
    const now = new Date();
    const entry: ScanActivityEntry = {
      timestamp: now.toISOString(),
      time: now.toISOString().slice(11, 19),
      level,
      message,
    };

    this.activities.unshift(entry);
    this.trim();
  }

  /**
   * Log a detailed scan result
   */
  logScan(data: {
    query: string;
    listingsFetched: number;
    listingsProcessed: number;
    cardsMatched: number;
    dealsFound: number;
    durationMs: number;
    errors?: string[];
  }): void {
    const now = new Date();
    const { query, listingsFetched, cardsMatched, dealsFound, durationMs, errors } = data;

    // Determine log level based on results
    let level: ActivityLevel = 'INFO';
    let message: string;

    if (errors && errors.length > 0) {
      level = 'ERROR';
      message = `Scan "${query}" failed: ${errors[0]}`;
    } else if (dealsFound > 0) {
      level = 'SUCCESS';
      message = `"${query}" → ${listingsFetched} scanned, ${cardsMatched} matched, ${dealsFound} deals`;
    } else if (cardsMatched > 0) {
      level = 'INFO';
      message = `"${query}" → ${listingsFetched} scanned, ${cardsMatched} matched, no deals`;
    } else {
      level = 'INFO';
      message = `"${query}" → ${listingsFetched} scanned, no matches`;
    }

    const entry: ScanActivityEntry = {
      timestamp: now.toISOString(),
      time: now.toISOString().slice(11, 19),
      level,
      message,
      details: {
        query,
        listingsFetched,
        listingsProcessed: data.listingsProcessed,
        cardsMatched,
        dealsFound,
        durationMs,
        errors,
      },
    };

    this.activities.unshift(entry);
    this.trim();
  }

  /**
   * Log when eBay rate limit is hit
   */
  logRateLimit(retryAfterMs: number): void {
    const now = new Date();
    const retryInMinutes = Math.ceil(retryAfterMs / 60000);

    const entry: ScanActivityEntry = {
      timestamp: now.toISOString(),
      time: now.toISOString().slice(11, 19),
      level: 'WARN',
      message: `eBay rate limited — retry in ${retryInMinutes} min`,
    };

    this.activities.unshift(entry);
    this.trim();
  }

  /**
   * Log a deal being found
   */
  logDeal(cardName: string, profitGBP: number, query?: string): void {
    const now = new Date();
    const profitStr = `£${profitGBP.toFixed(2)}`;
    const queryPart = query ? ` via "${query}"` : '';

    const entry: ScanActivityEntry = {
      timestamp: now.toISOString(),
      time: now.toISOString().slice(11, 19),
      level: 'SUCCESS',
      message: `Found: ${cardName} — ${profitStr} profit${queryPart}`,
    };

    this.activities.unshift(entry);
    this.trim();
  }

  /**
   * Get all activity entries
   */
  getAll(): ScanActivityEntry[] {
    return [...this.activities];
  }

  /**
   * Get recent entries with optional limit
   */
  getRecent(limit: number = 100): ScanActivityEntry[] {
    return this.activities.slice(0, limit);
  }

  /**
   * Get entries as legacy format strings (for backward compatibility)
   */
  getLegacyFormat(limit: number = 100): string[] {
    return this.activities.slice(0, limit).map(entry => {
      return `[${entry.time}] [${entry.level}] ${entry.message}`;
    });
  }

  /**
   * Get activity count
   */
  count(): number {
    return this.activities.length;
  }

  /**
   * Clear all activities
   */
  clear(): void {
    this.activities = [];
  }

  /**
   * Get stats about activity types
   */
  getStats(): { total: number; byLevel: Record<ActivityLevel, number> } {
    const byLevel: Record<ActivityLevel, number> = {
      INFO: 0,
      WARN: 0,
      ERROR: 0,
      SUCCESS: 0,
    };

    for (const entry of this.activities) {
      byLevel[entry.level]++;
    }

    return {
      total: this.activities.length,
      byLevel,
    };
  }

  private trim(): void {
    if (this.activities.length > this.MAX_ENTRIES) {
      this.activities = this.activities.slice(0, this.MAX_ENTRIES);
    }
  }
}

// Singleton export
export const scanActivity = new ScanActivityLogger();
