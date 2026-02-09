// src/routes/scanner.ts
// ═══════════════════════════════════════════════════════════════════════════
// Scanner Routes - API endpoints for controlling the automated scanner
// With detailed activity logging for the dashboard
// ═══════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { scannerLoop } from '../services/scanner/index.js';
import { dealStore, arbitrageEngine } from '../services/arbitrage/index.js';
import { exchangeRate } from '../services/currency/exchange-rate.js';
import { expansionService } from '../services/expansion/index.js';
import { logger } from '../utils/logger.js';
import { scanActivity } from '../utils/scan-activity.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Legacy log functions - now using shared scanActivity module
// ─────────────────────────────────────────────────────────────────────────────

export function addScanLog(message: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' = 'INFO'): void {
  scanActivity.log(message, level);
}

export function getScanLogs(limit: number = 100): string[] {
  return scanActivity.getLegacyFormat(limit);
}

export function clearScanLogs(): void {
  scanActivity.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scanner Control
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/scanner/status
 * Get current scanner status and statistics
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = scannerLoop.getStats();
    const dealStats = await dealStore.getStatsAsync();

    // Get current exchange rate and live status
    let currentRate = 1.27;
    let rateLive = false;
    try {
      const rates = await exchangeRate.getRates();
      currentRate = rates.rates.USD;
      rateLive = rates.isLive;
    } catch {
      // Use default
    }

    // Get next query in queue
    const nextQuery = scannerLoop.peekNextQuery();

    // Get detailed activity entries
    const recentActivity = scanActivity.getRecent(50);

    res.json({
      status: 'ok',
      scanner: {
        ...stats,
        nextQuery,
        exchangeRate: currentRate,
        exchangeRateLive: rateLive,
      },
      deals: {
        active: dealStats.activeDeals,
        total: dealStats.totalDeals,
        byTier: {
          premium: dealStats.premiumDeals,
          high: dealStats.highDeals,
          standard: dealStats.standardDeals,
        },
      },
      // Detailed activity entries for the dashboard
      recentActivity,
      // Legacy format for backward compatibility
      recentLogs: getScanLogs(50),
    });
  } catch (error) {
    logger.error({ event: 'SCANNER_STATUS_ERROR', error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/scanner/start
 * Start the automated scanner
 */
router.post('/start', (_req: Request, res: Response): void => {
  try {
    const stats = scannerLoop.getStats();
    
    if (stats.isRunning) {
      res.json({
        status: 'ok',
        message: 'Scanner is already running',
        scanner: stats,
      });
      return;
    }

    scannerLoop.start();
    addScanLog('Scanner started', 'SUCCESS');
    
    res.json({
      status: 'ok',
      message: 'Scanner started',
      scanner: scannerLoop.getStats(),
    });

    logger.info({ event: 'SCANNER_START_API' });
  } catch (error) {
    logger.error({ event: 'SCANNER_START_ERROR', error });
    addScanLog(`Scanner start failed: ${error instanceof Error ? error.message : 'Unknown'}`, 'ERROR');
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/scanner/stop
 * Stop the automated scanner
 */
router.post('/stop', (_req: Request, res: Response): void => {
  try {
    const stats = scannerLoop.getStats();
    
    if (!stats.isRunning) {
      res.json({
        status: 'ok',
        message: 'Scanner is not running',
        scanner: stats,
      });
      return;
    }

    scannerLoop.stop();
    addScanLog('Scanner stopped', 'INFO');
    
    res.json({
      status: 'ok',
      message: 'Scanner stopped',
      scanner: scannerLoop.getStats(),
    });

    logger.info({ event: 'SCANNER_STOP_API' });
  } catch (error) {
    logger.error({ event: 'SCANNER_STOP_ERROR', error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/scanner/scan
 * Trigger a manual scan (optional query parameter)
 */
router.post('/scan', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.body.query || req.query.q as string | undefined;
    
    addScanLog(`Manual scan triggered: ${query || 'auto-select'}`, 'INFO');
    logger.info({ event: 'MANUAL_SCAN_TRIGGERED', query: query || 'auto' });
    
    const result = await scannerLoop.runManualScan(query);
    
    // Log the result
    addScanLog(`Scan complete: ${result.listingsFetched} scanned, ${result.cardsMatched} matched, ${result.dealsFound} deals`,
      result.dealsFound > 0 ? 'SUCCESS' : 'INFO');
    
    if (result.errors.length > 0) {
      result.errors.forEach(err => addScanLog(`Scan error: ${err}`, 'ERROR'));
    }

    res.json({
      status: 'ok',
      message: 'Scan completed',
      result: {
        ...result,
        logs: getScanLogs(20),
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    addScanLog(`Scan failed: ${errorMsg}`, 'ERROR');
    logger.error({ event: 'MANUAL_SCAN_ERROR', error });
    res.status(500).json({
      status: 'error',
      message: errorMsg,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Logs Endpoints (NEW)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/scanner/logs
 * Get scan logs for debugging parser/matcher
 * Returns detailed activity entries with query, matches, and deals info
 */
router.get('/logs', (req: Request, res: Response): void => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const entries = scanActivity.getRecent(limit);
    const stats = scanActivity.getStats();

    res.json({
      status: 'ok',
      count: entries.length,
      maxLogs: 500,
      stats,
      // Detailed entries with full information
      entries,
      // Legacy format for backward compatibility
      logs: scanActivity.getLegacyFormat(limit),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/scanner/logs
 * Clear all logs
 */
router.delete('/logs', (_req: Request, res: Response): void => {
  try {
    const previousCount = scanActivity.count();
    clearScanLogs();
    addScanLog('Logs cleared', 'INFO');

    res.json({
      status: 'ok',
      message: `Cleared ${previousCount} log entries`,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Query Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/scanner/queries
 * Get all search queries in the rotation (static + dynamic)
 */
router.get('/queries', (_req: Request, res: Response): void => {
  try {
    const staticQueries = scannerLoop.getQueries();
    const dynamicQueries = scannerLoop.getDynamicQueries();
    const allQueries = scannerLoop.getAllQueries();
    
    // Group by category for better readability
    const byCategory: Record<string, typeof allQueries> = {};
    for (const q of allQueries) {
      if (!byCategory[q.category]) {
        byCategory[q.category] = [];
      }
      byCategory[q.category].push(q);
    }
    
    res.json({
      status: 'ok',
      total: allQueries.length,
      staticCount: staticQueries.length,
      dynamicCount: dynamicQueries.length,
      enabledCount: allQueries.filter(q => q.enabled).length,
      staticQueries,
      dynamicQueries,
      byCategory,
    });
  } catch (error) {
    logger.error({ event: 'GET_QUERIES_ERROR', error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/scanner/refresh-dynamic
 * Force refresh of dynamic queries from recent releases
 */
router.post('/refresh-dynamic', async (_req: Request, res: Response): Promise<void> => {
  try {
    logger.info({ event: 'DYNAMIC_QUERY_REFRESH_TRIGGERED' });
    addScanLog('Dynamic queries refresh triggered', 'INFO');
    
    // Call the public refresh method
    scannerLoop.forceRefreshDynamicQueries();
    
    const dynamicQueries = scannerLoop.getDynamicQueries();
    const stats = scannerLoop.getStats();
    
    addScanLog(`Dynamic queries refreshed: ${dynamicQueries.length} queries`, 'SUCCESS');
    
    res.json({
      status: 'ok',
      message: 'Dynamic queries refreshed',
      dynamicCount: dynamicQueries.length,
      lastRefresh: stats.lastDynamicRefresh,
      dynamicQueries,
    });
  } catch (error) {
    addScanLog(`Dynamic refresh failed: ${error instanceof Error ? error.message : 'Unknown'}`, 'ERROR');
    logger.error({ event: 'REFRESH_DYNAMIC_ERROR', error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/scanner/queries/:index
 * Update a search query
 */
router.put('/queries/:index', (req: Request, res: Response): void => {
  try {
    const index = parseInt(req.params.index, 10);
    const updates = req.body;

    if (isNaN(index) || index < 0) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid query index',
      });
      return;
    }

    scannerLoop.updateQuery(index, updates);
    
    res.json({
      status: 'ok',
      message: 'Query updated',
      queries: scannerLoop.getQueries(),
    });
  } catch (error) {
    logger.error({ event: 'UPDATE_QUERY_ERROR', error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/scanner/queries
 * Add a new search query
 */
router.post('/queries', (req: Request, res: Response): void => {
  try {
    const { query, category, weight, enabled } = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({
        status: 'error',
        message: 'Query string is required',
      });
      return;
    }

    scannerLoop.addQuery({
      query,
      category: category || 'general',
      weight: weight || 1,
      enabled: enabled !== false,
    });
    
    addScanLog(`Query added: "${query}"`, 'INFO');
    
    res.json({
      status: 'ok',
      message: 'Query added',
      queries: scannerLoop.getQueries(),
    });
  } catch (error) {
    logger.error({ event: 'ADD_QUERY_ERROR', error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PUT /api/scanner/config
 * Update scanner configuration
 */
router.put('/config', (req: Request, res: Response): void => {
  try {
    const updates = req.body;

    // Validate numeric fields
    if (updates.dailyCreditBudget !== undefined) {
      const budget = parseInt(updates.dailyCreditBudget, 10);
      if (isNaN(budget) || budget < 100 || budget > 5000) {
        res.status(400).json({
          status: 'error',
          message: 'Daily budget must be between 100 and 5000',
        });
        return;
      }
      updates.dailyCreditBudget = budget;
    }

    if (updates.listingsPerScan !== undefined) {
      const listings = parseInt(updates.listingsPerScan, 10);
      if (isNaN(listings) || listings < 10 || listings > 100) {
        res.status(400).json({
          status: 'error',
          message: 'Listings per scan must be between 10 and 100',
        });
        return;
      }
      updates.listingsPerScan = listings;
    }

    if (updates.dealExpirationHours !== undefined) {
      const hours = parseInt(updates.dealExpirationHours, 10);
      if (isNaN(hours) || hours < 1 || hours > 168) {
        res.status(400).json({
          status: 'error',
          message: 'Deal expiration must be between 1 and 168 hours',
        });
        return;
      }
      updates.dealExpirationHours = hours;
    }

    scannerLoop.updateConfig(updates);
    addScanLog(`Config updated: ${JSON.stringify(updates)}`, 'INFO');
    
    res.json({
      status: 'ok',
      message: 'Configuration updated',
      scanner: scannerLoop.getStats(),
    });
  } catch (error) {
    logger.error({ event: 'UPDATE_CONFIG_ERROR', error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Statistics & History
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/scanner/stats
 * Get detailed scanner statistics
 */
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const scannerStats = scannerLoop.getStats();
    const dailyStats = scannerLoop.getDailyStats();
    const dealStats = await dealStore.getStatsAsync();

    res.json({
      status: 'ok',
      scanner: scannerStats,
      daily: dailyStats,
      deals: dealStats,
    });
  } catch (error) {
    logger.error({ event: 'GET_STATS_ERROR', error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/scanner/history
 * Get recent scan history
 */
router.get('/history', (req: Request, res: Response): void => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const history = scannerLoop.getHistory().slice(0, limit);

    res.json({
      status: 'ok',
      count: history.length,
      history,
    });
  } catch (error) {
    logger.error({ event: 'GET_HISTORY_ERROR', error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scan Diagnostics - Track where matches fail in the pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/scanner/diagnostics
 * Get the last completed scan's diagnostic breakdown
 * Shows match rate and failure breakdown by stage
 */
router.get('/diagnostics', (_req: Request, res: Response): void => {
  try {
    const lastScan = arbitrageEngine.getLastDiagnostics();
    const session = arbitrageEngine.getSessionDiagnostics();

    // Helper to build failure breakdown with percentages
    const buildBreakdown = (d: typeof lastScan) => {
      if (!d) return null;
      const total = d.totalScanned;
      return {
        alreadyProcessed: { count: d.stage1_alreadyProcessed, pct: total > 0 ? ((d.stage1_alreadyProcessed / total) * 100).toFixed(1) : '0.0' },
        internationalSeller: { count: d.stage2_internationalSeller, pct: total > 0 ? ((d.stage2_internationalSeller / total) * 100).toFixed(1) : '0.0' },
        nonEnglish: { count: d.stage3_nonEnglish, pct: total > 0 ? ((d.stage3_nonEnglish / total) * 100).toFixed(1) : '0.0' },
        lowConfidence: { count: d.stage4_lowConfidence, pct: total > 0 ? ((d.stage4_lowConfidence / total) * 100).toFixed(1) : '0.0' },
        noExpansionMatch: { count: d.stage5_noExpansionMatch, pct: total > 0 ? ((d.stage5_noExpansionMatch / total) * 100).toFixed(1) : '0.0' },
        noCardNumber: { count: d.stage6_noCardNumber, pct: total > 0 ? ((d.stage6_noCardNumber / total) * 100).toFixed(1) : '0.0' },
        printedTotalMismatch: { count: d.stage7_printedTotalMismatch, pct: total > 0 ? ((d.stage7_printedTotalMismatch / total) * 100).toFixed(1) : '0.0' },
        scrydexNotFound: { count: d.stage8_scrydexNotFound, pct: total > 0 ? ((d.stage8_scrydexNotFound / total) * 100).toFixed(1) : '0.0' },
        nameMismatch: { count: d.stage9_nameMismatch, pct: total > 0 ? ((d.stage9_nameMismatch / total) * 100).toFixed(1) : '0.0' },
        noPriceMatch: { count: d.stage10_noPriceMatch, pct: total > 0 ? ((d.stage10_noPriceMatch / total) * 100).toFixed(1) : '0.0' },
        belowProfit: { count: d.stage11_belowProfit, pct: total > 0 ? ((d.stage11_belowProfit / total) * 100).toFixed(1) : '0.0' },
        belowThreshold: { count: d.stage12_belowThreshold, pct: total > 0 ? ((d.stage12_belowThreshold / total) * 100).toFixed(1) : '0.0' },
      };
    };

    // Helper to calculate match/deal rates
    // Three key rates for understanding pipeline performance:
    // 1. eligibilityRate = % of listings that passed pre-filters and queried Scrydex
    // 2. scrydexSuccessRate = % of Scrydex queries that found a match
    // 3. overallMatchRate = % of total listings that resulted in a successful match (most useful!)
    // 4. dealRate = % of matched cards that became deals
    const calculateRates = (d: typeof lastScan) => {
      if (!d) return {
        eligibilityRate: '0.0',
        scrydexSuccessRate: '0.0',
        overallMatchRate: '0.0',
        dealRate: '0.0',
        scrydexAttempts: 0
      };

      // Cards that actually attempted Scrydex matching (passed pre-filters)
      // = successfulMatches (found) + scrydexNotFound (not found)
      const scrydexAttempts = d.successfulMatches + d.stage8_scrydexNotFound;

      // eligibilityRate = % of total listings that made it to Scrydex query stage
      const eligibilityRate = d.totalScanned > 0
        ? ((scrydexAttempts / d.totalScanned) * 100).toFixed(1)
        : '0.0';

      // scrydexSuccessRate = % of Scrydex queries that found a match
      const scrydexSuccessRate = scrydexAttempts > 0
        ? ((d.successfulMatches / scrydexAttempts) * 100).toFixed(1)
        : '0.0';

      // overallMatchRate = % of total listings that resulted in a successful match
      // This is the most useful metric - answers "how many listings could we price?"
      const overallMatchRate = d.totalScanned > 0
        ? ((d.successfulMatches / d.totalScanned) * 100).toFixed(1)
        : '0.0';

      // dealRate = conversion rate (of matched cards, how many became deals?)
      const dealRate = d.successfulMatches > 0
        ? ((d.successfulDeals / d.successfulMatches) * 100).toFixed(1)
        : '0.0';

      return { eligibilityRate, scrydexSuccessRate, overallMatchRate, dealRate, scrydexAttempts };
    };

    // Build last scan diagnostics
    let lastScanData = null;
    if (lastScan) {
      const rates = calculateRates(lastScan);
      lastScanData = {
        totalScanned: lastScan.totalScanned,
        scrydexAttempts: rates.scrydexAttempts,
        successfulMatches: lastScan.successfulMatches,
        successfulDeals: lastScan.successfulDeals,
        // New clearer metrics
        eligibilityRate: `${rates.eligibilityRate}%`,      // % that passed pre-filters
        scrydexSuccessRate: `${rates.scrydexSuccessRate}%`, // % of Scrydex queries that found card
        matchRate: `${rates.overallMatchRate}%`,            // % of total that matched (the useful one!)
        dealRate: `${rates.dealRate}%`,
        failureBreakdown: buildBreakdown(lastScan),
      };
    }

    // Build session (cumulative) diagnostics
    const sd = session.diagnostics;
    const sessionRates = calculateRates(sd);
    const sessionData = {
      scanCount: session.scanCount,
      totalScanned: sd.totalScanned,
      scrydexAttempts: sessionRates.scrydexAttempts,
      successfulMatches: sd.successfulMatches,
      successfulDeals: sd.successfulDeals,
      // New clearer metrics
      eligibilityRate: `${sessionRates.eligibilityRate}%`,      // % that passed pre-filters
      scrydexSuccessRate: `${sessionRates.scrydexSuccessRate}%`, // % of Scrydex queries that found card
      matchRate: `${sessionRates.overallMatchRate}%`,            // % of total that matched (the useful one!)
      dealRate: `${sessionRates.dealRate}%`,
      failureBreakdown: buildBreakdown(sd),
    };

    // Get expansion validation stats for debugging ID mismatches
    const expansionValidation = expansionService.getValidationStats();

    res.json({
      status: 'ok',
      lastScan: lastScanData,
      session: sessionData,
      // Keep 'diagnostics' for backward compatibility (points to session data now)
      diagnostics: sessionData,
      // Expansion ID validation - helps debug scrydexNotFound issues
      expansionValidation: {
        validated: expansionValidation.validated,
        localExpansions: expansionValidation.localCount,
        scrydexExpansions: expansionValidation.scrydexCount,
        mappedIds: expansionValidation.mappedCount,
        unmappedIds: expansionValidation.unmappedCount,
        // Show if there's a potential ID mismatch issue
        potentialIssue: expansionValidation.unmappedCount > 0,
        // Include first 10 of each category for quick debugging
        details: {
          remappedIds: expansionValidation.details.remappedIds.slice(0, 10),
          invalidLocalIds: expansionValidation.details.invalidLocalIds.slice(0, 10),
          missingScrydexIds: expansionValidation.details.missingScrydexIds.slice(0, 10),
        },
      },
    });
  } catch (error) {
    logger.error({ event: 'GET_DIAGNOSTICS_ERROR', error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/scanner/diagnostics/reset
 * Reset session diagnostics
 */
router.post('/diagnostics/reset', (_req: Request, res: Response): void => {
  try {
    arbitrageEngine.resetSessionDiagnostics();
    res.json({
      status: 'ok',
      message: 'Session diagnostics reset',
    });
  } catch (error) {
    logger.error({ event: 'RESET_DIAGNOSTICS_ERROR', error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;