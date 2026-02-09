// src/services/scanner/scanner-loop.ts
// ═══════════════════════════════════════════════════════════════════════════
// Scanner Loop - Automated eBay scanning with credit budget management
// ═══════════════════════════════════════════════════════════════════════════

import { ebay, ebayClient } from '../ebay/index.js';
import { arbitrageEngine, dealStore } from '../arbitrage/index.js';
import { expansionService } from '../expansion/index.js';
import { scrydex } from '../scrydex/index.js';
import { logger } from '../../utils/logger.js';
import { scanActivity } from '../../utils/scan-activity.js';
import type { Deal } from '../arbitrage/types.js';
import type { ScrydexUsageResponse } from '../scrydex/types.js';
import type {
  SearchQuery,
  ScanResult,
  ScannerStats,
  ScannerConfig,
  DailyStats,
  ScannerMode,
  SearchType,
  CustomSearchTerm,
} from './types.js';
import { getPool } from '../database/postgres.js';

// ─────────────────────────────────────────────────────────────────────────────
// Default Search Queries - Optimized for UK Pokemon card arbitrage
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_QUERIES: SearchQuery[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // GRADED CARDS - Highest value potential, clearest arbitrage
  // ═══════════════════════════════════════════════════════════════════════════
  { query: 'pokemon psa 10', category: 'graded', weight: 3, enabled: true },
  { query: 'pokemon psa 9', category: 'graded', weight: 2, enabled: true },
  { query: 'pokemon psa 8', category: 'graded', weight: 2, enabled: true },
  { query: 'pokemon cgc 10', category: 'graded', weight: 2, enabled: true },
  { query: 'pokemon bgs 10', category: 'graded', weight: 1, enabled: true },
  { query: 'pokemon bgs 9.6', category: 'graded', weight: 1, enabled: true },
  { query: 'pokemon bgs 9', category: 'graded', weight: 1, enabled: true },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WOTC ERA - Complete Wizards of the Coast era (1999-2003)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Base Set Era (1999)
  { query: 'pokemon base set holo', category: 'wotc', weight: 3, enabled: true },
  { query: 'pokemon base set 1st edition', category: 'wotc', weight: 2, enabled: true },
  { query: 'pokemon shadowless', category: 'wotc', weight: 2, enabled: true },
  { query: 'pokemon base set 2 holo', category: 'wotc', weight: 1, enabled: true },
  
  // Jungle & Fossil (1999)
  { query: 'pokemon jungle holo', category: 'wotc', weight: 2, enabled: true },
  { query: 'pokemon jungle 1st edition', category: 'wotc', weight: 1, enabled: true },
  { query: 'pokemon fossil holo', category: 'wotc', weight: 2, enabled: true },
  { query: 'pokemon fossil 1st edition', category: 'wotc', weight: 1, enabled: true },
  
  // Team Rocket (2000)
  { query: 'pokemon team rocket holo', category: 'wotc', weight: 2, enabled: true },
  { query: 'pokemon team rocket 1st edition', category: 'wotc', weight: 1, enabled: true },
  { query: 'pokemon dark charizard', category: 'wotc', weight: 1, enabled: true },
  
  // Gym Heroes & Gym Challenge (2000)
  { query: 'pokemon gym heroes holo', category: 'wotc', weight: 2, enabled: true },
  { query: 'pokemon gym challenge holo', category: 'wotc', weight: 2, enabled: true },
  { query: 'pokemon gym 1st edition', category: 'wotc', weight: 1, enabled: true },
  
  // Neo Era (2000-2002)
  { query: 'pokemon neo genesis holo', category: 'wotc', weight: 2, enabled: true },
  { query: 'pokemon neo genesis 1st edition', category: 'wotc', weight: 1, enabled: true },
  { query: 'pokemon neo discovery holo', category: 'wotc', weight: 1, enabled: true },
  { query: 'pokemon neo revelation holo', category: 'wotc', weight: 1, enabled: true },
  { query: 'pokemon neo destiny holo', category: 'wotc', weight: 2, enabled: true },
  { query: 'pokemon neo destiny 1st edition', category: 'wotc', weight: 1, enabled: true },
  { query: 'pokemon shining charizard', category: 'wotc', weight: 1, enabled: true },
  { query: 'pokemon shining mewtwo', category: 'wotc', weight: 1, enabled: true },
  { query: 'pokemon shining tyranitar', category: 'wotc', weight: 1, enabled: true },
  
  // Legendary Collection (2002)
  { query: 'pokemon legendary collection holo', category: 'wotc', weight: 2, enabled: true },
  { query: 'pokemon legendary collection reverse', category: 'wotc', weight: 1, enabled: true },
  
  // e-Card Era (2002-2003)
  { query: 'pokemon expedition holo', category: 'wotc', weight: 1, enabled: true },
  { query: 'pokemon aquapolis holo', category: 'wotc', weight: 2, enabled: true },
  { query: 'pokemon skyridge holo', category: 'wotc', weight: 2, enabled: true },
  { query: 'pokemon skyridge crystal', category: 'wotc', weight: 1, enabled: true },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MODERN CHASE CARDS - High-value modern singles
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Alt Arts - Premium modern tier
  { query: 'pokemon alt art', category: 'chase', weight: 2, enabled: true },
  { query: 'pokemon alternate art', category: 'chase', weight: 1, enabled: true },
  { query: 'umbreon alt art', category: 'chase', weight: 2, enabled: true },
  { query: 'moonbreon', category: 'chase', weight: 1, enabled: true },
  { query: 'rayquaza alt art', category: 'chase', weight: 1, enabled: true },
  { query: 'charizard alt art', category: 'chase', weight: 1, enabled: true },
  
  // Special Art Rare (SAR) & Illustration Rare
  { query: 'pokemon special art rare', category: 'chase', weight: 2, enabled: true },
  { query: 'pokemon SAR', category: 'chase', weight: 1, enabled: true },
  { query: 'pokemon illustration rare', category: 'chase', weight: 2, enabled: true },
  { query: 'pokemon special illustration rare', category: 'chase', weight: 2, enabled: true },
  { query: 'pokemon SIR', category: 'chase', weight: 1, enabled: true },
  
  // Gold Stars & Premium
  { query: 'pokemon gold star', category: 'chase', weight: 1, enabled: true },
  { query: 'pokemon shiny vault', category: 'chase', weight: 1, enabled: true },
  
  // Specific high-value cards
  { query: 'charizard holo', category: 'chase', weight: 2, enabled: true },
  { query: 'charizard ex', category: 'chase', weight: 1, enabled: true },
  { query: 'charizard vmax', category: 'chase', weight: 1, enabled: true },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MODERN SETS - Established sets (recent releases handled by dynamic queries)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Note: Very recent sets (< 90 days) are covered by dynamic queries with high weights
  // These static queries cover established modern sets with stable prices
  
  // Pokemon 151 - Evergreen popularity
  { query: 'pokemon 151 holo', category: 'modern', weight: 2, enabled: true },
  { query: 'pokemon 151 full art', category: 'modern', weight: 1, enabled: true },
  
  // Sword & Shield Era highlights (established, stable arbitrage)
  { query: 'pokemon evolving skies', category: 'modern', weight: 2, enabled: true },
  { query: 'pokemon hidden fates', category: 'modern', weight: 1, enabled: true },
  { query: 'pokemon celebrations', category: 'modern', weight: 1, enabled: true },
  { query: 'pokemon crown zenith', category: 'modern', weight: 1, enabled: true },
  { query: 'pokemon shining fates', category: 'modern', weight: 1, enabled: true },
  
  // Card types (generic, catch-all)
  { query: 'pokemon ex full art', category: 'modern', weight: 1, enabled: true },
  { query: 'pokemon vmax rainbow', category: 'modern', weight: 1, enabled: true },
  { query: 'pokemon trainer gallery', category: 'modern', weight: 1, enabled: true },
  { query: 'pokemon galarian gallery', category: 'modern', weight: 1, enabled: true },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATCH-ALL - Low priority, broad query (less targeted = lower yield)
  // ═══════════════════════════════════════════════════════════════════════════
  { query: 'pokemon card', category: 'catchall', weight: 1, enabled: true },
];

// Queries that should NOT be searched (waste of credits)
// pikachu illustrator removed - will never find real one on eBay UK

// Language exclusion keywords - filters out non-English cards from search results
// These are appended as negative keywords to all eBay searches
const LANGUAGE_EXCLUSION_KEYWORDS = '-japanese -japan -jap -korean -chinese -french -german -spanish -italian -portuguese';

// ─────────────────────────────────────────────────────────────────────────────
// Default Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ScannerConfig = {
  // Scanner mode: 'both', 'graded', 'raw'
  scannerMode: 'both',

  // Search type: 'dynamic' uses built-in weighted queries, 'custom' uses user-defined terms
  searchType: 'dynamic',

  // ~1,500/day budget - 50k/month ÷ 30 days = 1,666/day, we use 1,500 for safety
  dailyCreditBudget: 1500,

  // Scan interval bounds (calculated dynamically based on budget)
  // Minimum 10 minutes for faster deal discovery while staying within eBay API rate limits
  // 40 listings × 41 API calls/scan × 6 scans/hour × 17 operating hours = ~4,182 calls/day (84% of 5,000 limit)
  minScanIntervalMinutes: 10,
  maxScanIntervalMinutes: 30,

  // Listings per scan - 40 provides good coverage while limiting API usage
  // Each listing requires 1 getItem call for condition enrichment
  listingsPerScan: 40,

  // Estimated credits per scan for interval calculation
  // Reduced from 15 to 4 due to caching and early filtering
  // At ~102 scans/day × 4 credits = ~408 Scrydex credits/day = ~12,240/month (24% of 50k limit)
  estimatedCreditsPerScan: 4,

  // Operating hours (UK time - covers peak listing times)
  operatingHours: {
    start: 6,  // 6 AM (catches early birds)
    end: 23,   // 11 PM
  },

  // Auto-start when server boots
  autoStart: false,

  // Deals expire after 48 hours
  dealExpirationHours: 48,

  // How often to refresh dynamic queries (hours)
  dynamicQueryRefreshHours: 24,
};

// ─────────────────────────────────────────────────────────────────────────────
// Scanner Loop Class
// ─────────────────────────────────────────────────────────────────────────────

class ScannerLoop {
  private config: ScannerConfig;
  private queries: SearchQuery[];
  private dynamicQueries: SearchQuery[] = [];
  private customQueries: SearchQuery[] = [];
  private rotationIndex: number = 0;
  private weightedQueue: number[] = [];

  private isRunning: boolean = false;
  private scanTimer: NodeJS.Timeout | null = null;
  private expirationTimer: NodeJS.Timeout | null = null;
  private dynamicQueryTimer: NodeJS.Timeout | null = null;
  private usageRefreshTimer: NodeJS.Timeout | null = null;

  private dailyStats: DailyStats;
  private lastScanAt: Date | null = null;
  private nextScanAt: Date | null = null;
  private currentQuery: string | null = null;
  private lastDynamicQueryRefresh: Date | null = null;

  // API usage tracking from Scrydex
  private apiUsage: ScrydexUsageResponse | null = null;
  private readonly MONTHLY_CREDIT_LIMIT = 50000;
  private readonly USAGE_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  private scanHistory: ScanResult[] = [];
  private readonly MAX_HISTORY = 100;

  constructor(config?: Partial<ScannerConfig>, queries?: SearchQuery[]) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.queries = queries || DEFAULT_QUERIES;
    this.dailyStats = this.createEmptyDailyStats();

    // Note: Dynamic queries will be initialized after expansion service loads
    // Call initializeDynamicQueries() from index.ts after expansionService.initialize()

    this.buildWeightedQueue();

    // Set up daily stats reset at midnight
    this.scheduleDailyReset();

    // Start deal expiration checker
    this.startExpirationChecker();

    // Start dynamic query refresh timer
    this.startDynamicQueryRefresh();

    // Start API usage tracking
    this.startUsageTracking();
  }

  /**
   * Initialize dynamic queries - call this AFTER expansion service is loaded
   */
  initializeDynamicQueries(): void {
    this.refreshDynamicQueries();
    logger.info({ event: 'DYNAMIC_QUERIES_INITIALIZED' });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Dynamic Recent Release Queries
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Refresh dynamic queries based on recent releases from Scrydex
   * Gets expansions released in the last 90 days and adds them as high-priority queries
   */
  private refreshDynamicQueries(): void {
    try {
      // Get all English expansions from cache
      const allExpansions = expansionService.getAll();
      
      if (allExpansions.length === 0) {
        logger.warn({ event: 'DYNAMIC_QUERIES_SKIPPED', reason: 'Expansion cache not loaded' });
        return;
      }

      const now = new Date();
      const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      const fourteenDaysAgo = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));

      // Filter to recent English releases
      const recentReleases = allExpansions
        .filter(exp => {
          if (exp.languageCode !== 'EN') return false;
          if (exp.isOnlineOnly) return false;
          if (!exp.releaseDate) return false;
          
          const releaseDate = this.parseReleaseDate(exp.releaseDate);
          return releaseDate && releaseDate >= ninetyDaysAgo;
        })
        .sort((a, b) => {
          const dateA = this.parseReleaseDate(a.releaseDate);
          const dateB = this.parseReleaseDate(b.releaseDate);
          return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
        });

      // Create dynamic queries for recent releases with BOOSTED weights
      this.dynamicQueries = recentReleases.map(exp => {
        const releaseDate = this.parseReleaseDate(exp.releaseDate);
        const isBrandNew = releaseDate && releaseDate >= fourteenDaysAgo;
        const isVeryRecent = releaseDate && releaseDate >= thirtyDaysAgo;
        
        // Weight tiers: < 14 days = 6, < 30 days = 5, < 90 days = 3
        let weight = 3;
        if (isBrandNew) weight = 6;
        else if (isVeryRecent) weight = 5;
        
        return {
          query: `pokemon ${exp.name.toLowerCase()}`,
          category: 'dynamic-recent' as const,
          weight,
          enabled: true,
          meta: {
            expansionId: exp.id,
            releaseDate: exp.releaseDate,
            isAutoGenerated: true,
          },
        };
      });

      // Add chase card queries for sets < 30 days (expanded variations)
      const veryRecentReleases = recentReleases.filter(exp => {
        const releaseDate = this.parseReleaseDate(exp.releaseDate);
        return releaseDate && releaseDate >= thirtyDaysAgo;
      });

      for (const exp of veryRecentReleases.slice(0, 5)) { // Top 5 newest sets (was 3)
        const releaseDate = this.parseReleaseDate(exp.releaseDate);
        const isBrandNew = releaseDate && releaseDate >= fourteenDaysAgo;
        const baseWeight = isBrandNew ? 5 : 4;
        
        // Full art query
        this.dynamicQueries.push({
          query: `pokemon ${exp.name.toLowerCase()} full art`,
          category: 'dynamic-recent' as const,
          weight: baseWeight,
          enabled: true,
          meta: { expansionId: exp.id, isAutoGenerated: true },
        });
        
        // Illustration rare / Special illustration rare
        this.dynamicQueries.push({
          query: `pokemon ${exp.name.toLowerCase()} illustration rare`,
          category: 'dynamic-recent' as const,
          weight: baseWeight,
          enabled: true,
          meta: { expansionId: exp.id, isAutoGenerated: true },
        });
        
        // Alt art (for sets that have them)
        this.dynamicQueries.push({
          query: `pokemon ${exp.name.toLowerCase()} alt art`,
          category: 'dynamic-recent' as const,
          weight: baseWeight,
          enabled: true,
          meta: { expansionId: exp.id, isAutoGenerated: true },
        });
        
        // Ex/holo for new sets
        this.dynamicQueries.push({
          query: `pokemon ${exp.name.toLowerCase()} ex`,
          category: 'dynamic-recent' as const,
          weight: baseWeight - 1,
          enabled: true,
          meta: { expansionId: exp.id, isAutoGenerated: true },
        });
      }

      this.lastDynamicQueryRefresh = new Date();
      
      logger.info({
        event: 'DYNAMIC_QUERIES_REFRESHED',
        recentReleases: recentReleases.map(e => e.name),
        dynamicQueriesCount: this.dynamicQueries.length,
        nextRefresh: new Date(now.getTime() + (this.config.dynamicQueryRefreshHours || 24) * 60 * 60 * 1000).toISOString(),
      });

      // Rebuild weighted queue to include dynamic queries
      this.buildWeightedQueue();
      
    } catch (error) {
      logger.error({
        event: 'DYNAMIC_QUERIES_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private parseReleaseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    
    // Handle YYYY/MM/DD format from Scrydex
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [year, month, day] = parts.map(Number);
      return new Date(year, month - 1, day);
    }
    
    // Try standard date parse as fallback
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  private startDynamicQueryRefresh(): void {
    const refreshInterval = (this.config.dynamicQueryRefreshHours || 24) * 60 * 60 * 1000;
    
    this.dynamicQueryTimer = setInterval(() => {
      this.refreshDynamicQueries();
    }, refreshInterval);

    logger.debug({
      event: 'DYNAMIC_QUERY_REFRESH_SCHEDULED',
      intervalHours: this.config.dynamicQueryRefreshHours || 24,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // API Usage Tracking
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Start periodic API usage tracking from Scrydex
   * This allows dynamic adjustment of scan intervals based on actual usage
   */
  private startUsageTracking(): void {
    // Fetch initial usage
    this.refreshApiUsage();

    // Refresh periodically
    this.usageRefreshTimer = setInterval(() => {
      this.refreshApiUsage();
    }, this.USAGE_REFRESH_INTERVAL_MS);

    logger.debug({
      event: 'USAGE_TRACKING_STARTED',
      refreshIntervalMinutes: this.USAGE_REFRESH_INTERVAL_MS / 60000,
    });
  }

  /**
   * Fetch current API usage from Scrydex
   */
  private async refreshApiUsage(): Promise<void> {
    try {
      const usage = await scrydex.getUsage();
      if (usage) {
        this.apiUsage = usage;

        const usedCredits = usage.total_credits_consumed || 0;
        const remainingCredits = this.MONTHLY_CREDIT_LIMIT - usedCredits;
        const daysRemaining = this.getDaysRemainingInPeriod();

        logger.info({
          event: 'API_USAGE_REFRESHED',
          usedCredits,
          remainingCredits,
          monthlyLimit: this.MONTHLY_CREDIT_LIMIT,
          periodEnd: usage.period_end,
          daysRemaining,
          calculatedDailyBudget: daysRemaining > 0 ? Math.floor(remainingCredits / daysRemaining) : 0,
        });
      }
    } catch (error) {
      logger.warn({ event: 'API_USAGE_REFRESH_FAILED', error });
    }
  }

  /**
   * Calculate remaining days in the billing period
   */
  private getDaysRemainingInPeriod(): number {
    if (!this.apiUsage?.period_end) {
      // Default to ~30 days if we don't have period data
      return 30;
    }

    const now = new Date();
    const periodEnd = new Date(this.apiUsage.period_end);
    const msRemaining = periodEnd.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

    return Math.max(1, daysRemaining); // At least 1 day to avoid division by zero
  }

  /**
   * Get the effective daily budget based on actual API usage
   * This dynamically adjusts based on remaining credits and days in period
   */
  private getEffectiveDailyBudget(): number {
    if (!this.apiUsage) {
      // Fall back to configured budget if no usage data
      return this.config.dailyCreditBudget;
    }

    const usedCredits = this.apiUsage.total_credits_consumed || 0;
    const remainingCredits = Math.max(0, this.MONTHLY_CREDIT_LIMIT - usedCredits);
    const daysRemaining = this.getDaysRemainingInPeriod();

    // Calculate daily budget from remaining credits
    // Use 90% of remaining to leave buffer for spikes
    const calculatedBudget = Math.floor((remainingCredits * 0.9) / daysRemaining);

    // Clamp between reasonable bounds (100 - 3000 credits/day)
    return Math.max(100, Math.min(3000, calculatedBudget));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Start the automated scanning loop
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn({ event: 'SCANNER_ALREADY_RUNNING' });
      return;
    }

    // Load scanner mode from user preferences before starting
    await this.loadPreferences();

    this.isRunning = true;

    // Count active queries based on scanner mode
    const mode = this.config.scannerMode;
    const allQueries = this.getAllQueries();
    const activeQueries = allQueries.filter(q => {
      if (!q.enabled) return false;
      if (mode === 'graded' && q.category !== 'graded') return false;
      if (mode === 'raw' && q.category === 'graded') return false;
      return true;
    });

    logger.info({
      event: 'SCANNER_STARTED',
      scannerMode: mode,
      dailyBudget: this.config.dailyCreditBudget,
      staticQueries: this.queries.filter(q => q.enabled).length,
      dynamicQueries: this.dynamicQueries.filter(q => q.enabled).length,
      activeQueries: activeQueries.length,
      intervalMinutes: this.calculateScanInterval(),
    });

    scanActivity.log(`Scanner started (${activeQueries.length} queries, mode: ${mode})`, 'SUCCESS');

    // Run first scan immediately
    this.runScan();
  }

  /**
   * Stop the automated scanning loop
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn({ event: 'SCANNER_NOT_RUNNING' });
      return;
    }

    this.isRunning = false;

    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }

    this.nextScanAt = null;
    this.currentQuery = null;

    logger.info({
      event: 'SCANNER_STOPPED',
      scansCompleted: this.dailyStats.scansCompleted,
      creditsUsed: this.dailyStats.creditsUsed,
    });

    scanActivity.log(
      `Scanner stopped (${this.dailyStats.scansCompleted} scans, ${this.dailyStats.dealsFound} deals today)`,
      'INFO'
    );
  }

  /**
   * Run a single scan immediately (manual trigger)
   */
  async runManualScan(query?: string): Promise<ScanResult> {
    const searchQuery = query || this.getNextQuery();
    return this.executeScan(searchQuery);
  }

  /**
   * Get current scanner statistics
   */
  getStats(): ScannerStats {
    const allQueries = this.getAllQueries();
    const effectiveDailyBudget = this.getEffectiveDailyBudget();
    const creditsRemaining = effectiveDailyBudget - this.dailyStats.creditsUsed;

    // API usage info
    const monthlyUsed = this.apiUsage?.total_credits_consumed || 0;
    const monthlyRemaining = this.MONTHLY_CREDIT_LIMIT - monthlyUsed;
    const daysRemaining = this.getDaysRemainingInPeriod();

    // Count active queries based on scanner mode
    const mode = this.config.scannerMode;
    const searchType = this.config.searchType;
    const activeQueries = allQueries.filter(q => {
      if (!q.enabled) return false;
      // For 'recent' search type, don't filter by scanner mode
      if (searchType === 'recent') return true;
      if (mode === 'graded' && q.category !== 'graded') return false;
      if (mode === 'raw' && q.category === 'graded') return false;
      return true;
    });

    return {
      isRunning: this.isRunning,
      status: this.getStatusMessage(),
      scannerMode: this.config.scannerMode,
      searchType: this.config.searchType,
      scansToday: this.dailyStats.scansCompleted,
      creditsToday: this.dailyStats.creditsUsed,
      dailyBudget: effectiveDailyBudget, // Now dynamic based on API usage
      creditsRemaining: Math.max(0, creditsRemaining),
      currentQuery: this.currentQuery,
      rotationIndex: this.rotationIndex,
      totalQueries: activeQueries.length,
      staticQueries: this.queries.filter(q => q.enabled).length,
      dynamicQueries: this.dynamicQueries.filter(q => q.enabled).length,
      customQueries: this.customQueries.filter(q => q.enabled).length,
      lastScanAt: this.lastScanAt,
      nextScanAt: this.nextScanAt,
      scanIntervalMinutes: this.calculateScanInterval(),
      dealsFoundToday: this.dailyStats.dealsFound,
      statsDate: this.dailyStats.date,
      lastDynamicRefresh: this.lastDynamicQueryRefresh,
      // Monthly API usage
      monthlyCreditsUsed: monthlyUsed,
      monthlyCreditsRemaining: monthlyRemaining,
      monthlyLimit: this.MONTHLY_CREDIT_LIMIT,
      billingDaysRemaining: daysRemaining,
      // eBay rate limit status (include full data for UI display)
      ebayRateLimited: ebayClient.isRateLimited(),
      ebayRateLimitRetryAfterMs: ebayClient.getRateLimitStatus().retryAfterMs,
      ebayRateLimits: ebayClient.getRateLimitStatus(),
    };
  }

  /**
   * Get all search queries based on search type
   * - 'dynamic': static + dynamic queries (built-in weighted search)
   * - 'custom': only custom user-defined queries
   * - 'recent': single query for fetching newest listings
   */
  getAllQueries(): SearchQuery[] {
    if (this.config.searchType === 'recent') {
      // For 'recent' mode, use a single generic query to fetch newest Pokemon card listings
      return [{
        query: 'pokemon',
        category: 'catchall' as const,
        weight: 1,
        enabled: true,
        meta: {
          isAutoGenerated: true,
        },
      }];
    }
    if (this.config.searchType === 'custom') {
      return [...this.customQueries];
    }
    return [...this.queries, ...this.dynamicQueries];
  }

  /**
   * Get custom search queries
   */
  getCustomQueries(): SearchQuery[] {
    return [...this.customQueries];
  }

  /**
   * Get the list of static search queries
   */
  getQueries(): SearchQuery[] {
    return [...this.queries];
  }

  /**
   * Get dynamic queries (auto-generated from recent releases)
   */
  getDynamicQueries(): SearchQuery[] {
    return [...this.dynamicQueries];
  }

  /**
   * Force refresh of dynamic queries
   */
  forceRefreshDynamicQueries(): void {
    this.refreshDynamicQueries();
  }

  /**
   * Load scanner preferences from user preferences in database
   */
  async loadPreferences(): Promise<void> {
    try {
      const pool = getPool();
      if (!pool) {
        logger.debug({ event: 'SCANNER_PREFERENCES_SKIP', reason: 'No database connection' });
        return;
      }

      const result = await pool.query(`
        SELECT
          scanner_mode,
          daily_credit_budget,
          operating_hours_start,
          operating_hours_end,
          search_type,
          custom_search_terms
        FROM user_preferences WHERE id = 1
      `);

      if (result.rows.length > 0) {
        const prefs = result.rows[0];
        let configChanged = false;

        // Scanner mode
        if (prefs.scanner_mode) {
          const mode = prefs.scanner_mode as ScannerMode;
          if (['both', 'graded', 'raw'].includes(mode)) {
            const previousMode = this.config.scannerMode;
            if (previousMode !== mode) {
              this.config.scannerMode = mode;
              configChanged = true;
              logger.info({
                event: 'SCANNER_MODE_LOADED',
                previousMode,
                newMode: mode,
              });
            }
          }
        }

        // Daily credit budget
        if (prefs.daily_credit_budget !== null && prefs.daily_credit_budget !== undefined) {
          const budget = parseInt(prefs.daily_credit_budget, 10);
          if (!isNaN(budget) && budget > 0 && budget !== this.config.dailyCreditBudget) {
            const previousBudget = this.config.dailyCreditBudget;
            this.config.dailyCreditBudget = budget;
            configChanged = true;
            logger.info({
              event: 'DAILY_CREDIT_BUDGET_LOADED',
              previousBudget,
              newBudget: budget,
            });
          }
        }

        // Operating hours
        if (prefs.operating_hours_start !== null && prefs.operating_hours_start !== undefined) {
          const startHour = parseInt(prefs.operating_hours_start, 10);
          if (!isNaN(startHour) && startHour >= 0 && startHour <= 23) {
            if (this.config.operatingHours.start !== startHour) {
              this.config.operatingHours.start = startHour;
              configChanged = true;
            }
          }
        }
        if (prefs.operating_hours_end !== null && prefs.operating_hours_end !== undefined) {
          const endHour = parseInt(prefs.operating_hours_end, 10);
          if (!isNaN(endHour) && endHour >= 0 && endHour <= 24) {
            if (this.config.operatingHours.end !== endHour) {
              this.config.operatingHours.end = endHour;
              configChanged = true;
            }
          }
        }

        // Search type (dynamic, custom, or recent)
        if (prefs.search_type) {
          const searchType = prefs.search_type as SearchType;
          if (['dynamic', 'custom', 'recent'].includes(searchType)) {
            const previousType = this.config.searchType;
            if (previousType !== searchType) {
              this.config.searchType = searchType;
              configChanged = true;
              logger.info({
                event: 'SEARCH_TYPE_LOADED',
                previousType,
                newType: searchType,
              });
            }
          }
        }

        // Custom search terms (JSON array)
        if (prefs.custom_search_terms) {
          try {
            const terms = prefs.custom_search_terms as CustomSearchTerm[];
            if (Array.isArray(terms)) {
              // Convert to SearchQuery format
              this.customQueries = terms.map(term => ({
                query: term.term,
                category: 'custom' as const,
                weight: Math.max(1, Math.min(5, term.weight || 2)),
                enabled: term.enabled !== false,
                meta: {
                  isUserDefined: true,
                },
              }));
              this.config.customSearchTerms = terms;
              logger.info({
                event: 'CUSTOM_SEARCH_TERMS_LOADED',
                count: this.customQueries.length,
                enabledCount: this.customQueries.filter(q => q.enabled).length,
              });
              // Mark as changed to rebuild queue
              if (this.customQueries.length > 0) {
                configChanged = true;
              }
            }
          } catch {
            logger.warn({ event: 'CUSTOM_SEARCH_TERMS_PARSE_ERROR' });
          }
        }

        if (configChanged) {
          logger.info({
            event: 'SCANNER_PREFERENCES_LOADED',
            scannerMode: this.config.scannerMode,
            searchType: this.config.searchType,
            dailyCreditBudget: this.config.dailyCreditBudget,
            operatingHours: this.config.operatingHours,
            customQueriesCount: this.customQueries.length,
          });
          // Rebuild queue to reflect new mode if changed
          this.buildWeightedQueue();
        }
      }
    } catch (error) {
      logger.warn({
        event: 'SCANNER_PREFERENCES_LOAD_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Update scanner mode and rebuild query queue
   */
  setScannerMode(mode: ScannerMode): void {
    if (!['both', 'graded', 'raw'].includes(mode)) {
      logger.warn({ event: 'INVALID_SCANNER_MODE', mode });
      return;
    }

    const previousMode = this.config.scannerMode;
    if (previousMode === mode) return;

    this.config.scannerMode = mode;
    this.rotationIndex = 0; // Reset rotation
    this.buildWeightedQueue();

    logger.info({
      event: 'SCANNER_MODE_CHANGED',
      previousMode,
      newMode: mode,
      activeQueries: new Set(this.weightedQueue).size,
    });

    scanActivity.log(`Scanner mode changed to: ${mode}`, 'INFO');
  }

  /**
   * Get current scanner mode
   */
  getScannerMode(): ScannerMode {
    return this.config.scannerMode;
  }

  /**
   * Update search type and rebuild query queue
   * @param searchType 'dynamic' for built-in weighted queries, 'custom' for user-defined terms, 'recent' for newest listings
   */
  setSearchType(searchType: SearchType): void {
    if (!['dynamic', 'custom', 'recent'].includes(searchType)) {
      logger.warn({ event: 'INVALID_SEARCH_TYPE', searchType });
      return;
    }

    const previousType = this.config.searchType;
    if (previousType === searchType) return;

    this.config.searchType = searchType;
    this.rotationIndex = 0; // Reset rotation
    this.buildWeightedQueue();

    logger.info({
      event: 'SEARCH_TYPE_CHANGED',
      previousType,
      newType: searchType,
      activeQueries: new Set(this.weightedQueue).size,
      customQueriesCount: this.customQueries.length,
    });

    scanActivity.log(`Search type changed to: ${searchType}`, 'INFO');
  }

  /**
   * Get current search type
   */
  getSearchType(): SearchType {
    return this.config.searchType;
  }

  /**
   * Set custom search terms (replaces existing custom queries)
   * @param terms Array of custom search terms with weights
   */
  setCustomSearchTerms(terms: CustomSearchTerm[]): void {
    // Convert CustomSearchTerm[] to SearchQuery[]
    this.customQueries = terms.map(term => ({
      query: term.term,
      category: 'custom' as const,
      weight: Math.max(1, Math.min(5, term.weight)), // Clamp weight to 1-5
      enabled: term.enabled,
      meta: {
        isUserDefined: true,
      },
    }));

    // Update config
    this.config.customSearchTerms = terms;

    // Rebuild queue if we're in custom mode
    if (this.config.searchType === 'custom') {
      this.rotationIndex = 0;
      this.buildWeightedQueue();
    }

    logger.info({
      event: 'CUSTOM_SEARCH_TERMS_UPDATED',
      count: this.customQueries.length,
      enabledCount: this.customQueries.filter(q => q.enabled).length,
    });

    scanActivity.log(`Custom search terms updated: ${this.customQueries.length} terms`, 'INFO');
  }

  /**
   * Get current custom search terms
   */
  getCustomSearchTerms(): CustomSearchTerm[] {
    return this.config.customSearchTerms || [];
  }

  /**
   * Update a search query
   */
  updateQuery(index: number, updates: Partial<SearchQuery>): void {
    if (index >= 0 && index < this.queries.length) {
      this.queries[index] = { ...this.queries[index], ...updates };
      this.buildWeightedQueue();
      logger.info({ event: 'QUERY_UPDATED', index, query: this.queries[index].query });
    }
  }

  /**
   * Add a new search query
   */
  addQuery(query: SearchQuery): void {
    this.queries.push(query);
    this.buildWeightedQueue();
    logger.info({ event: 'QUERY_ADDED', query: query.query });
  }

  /**
   * Update scanner configuration
   */
  updateConfig(updates: Partial<ScannerConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info({ event: 'CONFIG_UPDATED', config: this.config });
  }

  /**
   * Get recent scan history
   */
  getHistory(): ScanResult[] {
    return [...this.scanHistory];
  }

  /**
   * Peek at the next query without advancing the rotation
   */
  peekNextQuery(): string | null {
    // Build queue if empty (same logic as getNextQuery)
    if (this.weightedQueue.length === 0) {
      this.buildWeightedQueue();
    }

    // Still empty after building = no enabled queries
    if (this.weightedQueue.length === 0) {
      return null;
    }

    const allQueries = this.getAllQueries();
    const queryIndex = this.weightedQueue[this.rotationIndex % this.weightedQueue.length];

    // Handle case where queryIndex is out of bounds (e.g., searchType changed)
    if (queryIndex >= allQueries.length) {
      this.buildWeightedQueue();
      if (this.weightedQueue.length === 0) return null;
      const newQueryIndex = this.weightedQueue[0];
      return allQueries[newQueryIndex]?.query || null;
    }

    return allQueries[queryIndex]?.query || null;
  }

  /**
   * Get today's statistics
   */
  getDailyStats(): DailyStats {
    return { ...this.dailyStats };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Core Scanning Logic
  // ───────────────────────────────────────────────────────────────────────────

  private async runScan(): Promise<void> {
    if (!this.isRunning) return;

    // Check if within operating hours
    if (!this.isWithinOperatingHours()) {
      this.scheduleNextScan();
      return;
    }

    // Check daily budget
    if (this.dailyStats.creditsUsed >= this.config.dailyCreditBudget) {
      logger.warn({
        event: 'DAILY_BUDGET_EXHAUSTED',
        used: this.dailyStats.creditsUsed,
        budget: this.config.dailyCreditBudget,
      });
      this.scheduleNextScan();
      return;
    }

    const query = this.getNextQuery();
    this.currentQuery = query;

    try {
      const result = await this.executeScan(query);
      this.recordScanResult(result);
    } catch (error) {
      logger.error({
        event: 'SCAN_ERROR',
        query,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.dailyStats.errors++;
    }

    this.currentQuery = null;
    this.scheduleNextScan();
  }

  private async executeScan(query: string): Promise<ScanResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let listingsFetched = 0;
    let listingsProcessed = 0;
    let cardsMatched = 0;
    let dealsFound = 0;
    let creditsUsed = 0;

    // Append language exclusion keywords to filter out non-English cards
    const searchQuery = `${query} ${LANGUAGE_EXCLUSION_KEYWORDS}`;

    try {
      // Fetch listings from eBay
      // IMPORTANT: Use fieldgroups=EXTENDED to get item specifics (including card condition)
      const searchResult = await ebay.searchListings({
        query: searchQuery,
        limit: this.config.listingsPerScan,
        sortOrder: 'newlyListed',
        fieldgroups: 'EXTENDED',
      });

      // Check if rate limited
      if (searchResult.rateLimited) {
        const status = ebayClient.getRateLimitStatus();
        scanActivity.logRateLimit(status.retryAfterMs);
        logger.warn({
          event: 'SCAN_RATE_LIMITED',
          query,
          retryAfterMs: status.retryAfterMs,
        });
        // Return early - don't count this as a failed scan
        return {
          query,
          listingsFetched: 0,
          listingsProcessed: 0,
          cardsMatched: 0,
          dealsFound: 0,
          creditsUsed: 0,
          durationMs: Date.now() - startTime,
          completedAt: new Date(),
          errors: ['Rate limited by eBay API'],
        };
      }

      listingsFetched = searchResult.listings?.length || 0;

      if (listingsFetched === 0) {
        logger.debug({ event: 'SCAN_NO_LISTINGS', query });
      } else {
        // Enrich listings with conditionDescriptors from getItem API
        // This fetches full item details for listings where condition couldn't be determined
        // from the search results (conditionSource === 'default')
        const enrichedListings = await ebay.enrichListingsWithCondition(
          searchResult.listings,
          { maxConcurrent: 5 }
        );

        // Start scan diagnostics tracking
        arbitrageEngine.startScanDiagnostics();

        // Process each listing through arbitrage engine
        const deals: Deal[] = [];

        for (const listing of enrichedListings) {
          try {
            const result = await arbitrageEngine.processListing(listing);
            listingsProcessed++;

            // Track Scrydex matches (even if no deal)
            if (result.matched) {
              cardsMatched++;
              creditsUsed++; // Each Scrydex query costs 1 credit
            }

            if (result.success && result.deal) {
              deals.push(result.deal);
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            errors.push(`Listing ${listing.itemId}: ${errorMsg}`);
          }
        }

        dealsFound = deals.length;

        // End scan diagnostics and log summary
        arbitrageEngine.endScanDiagnostics();

        if (dealsFound > 0) {
          logger.info({
            event: 'DEALS_FOUND',
            query,
            count: dealsFound,
            deals: deals.map((d: Deal) => ({
              card: d.cardName,
              profit: d.profitGBP,
              discount: d.discountPercent,
            })),
          });
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMsg);
      logger.error({ event: 'SCAN_EXECUTION_ERROR', query, error: errorMsg });
    }

    const result: ScanResult = {
      query,
      listingsFetched,
      listingsProcessed,
      cardsMatched,
      dealsFound,
      creditsUsed,
      durationMs: Date.now() - startTime,
      completedAt: new Date(),
      errors,
    };

    return result;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Query Rotation
  // ───────────────────────────────────────────────────────────────────────────

  private buildWeightedQueue(): void {
    this.weightedQueue = [];

    const allQueries = this.getAllQueries();
    const mode = this.config.scannerMode;
    const searchType = this.config.searchType;

    allQueries.forEach((query, index) => {
      if (!query.enabled) return;

      // For 'recent' search type, don't filter by scanner mode
      // The catch-all query fetches all new listings, filtering happens in arbitrage engine
      if (searchType !== 'recent') {
        // Filter based on scanner mode
        if (mode === 'graded' && query.category !== 'graded') return;
        if (mode === 'raw' && query.category === 'graded') return;
        // mode === 'both' includes all queries
      }

      // Add index to queue 'weight' times
      for (let i = 0; i < query.weight; i++) {
        this.weightedQueue.push(index);
      }
    });

    // Shuffle for randomness within weight distribution
    this.shuffleArray(this.weightedQueue);

    const activeQueries = new Set(this.weightedQueue).size;

    logger.debug({
      event: 'WEIGHTED_QUEUE_BUILT',
      scannerMode: mode,
      searchType: this.config.searchType,
      totalSlots: this.weightedQueue.length,
      uniqueQueries: activeQueries,
      staticQueries: this.queries.filter(q => q.enabled).length,
      dynamicQueries: this.dynamicQueries.filter(q => q.enabled).length,
      customQueries: this.customQueries.filter(q => q.enabled).length,
    });
  }

  private getNextQuery(): string {
    if (this.weightedQueue.length === 0) {
      this.buildWeightedQueue();
    }

    const allQueries = this.getAllQueries();

    // Get next index from weighted queue
    const queryIndex = this.weightedQueue[this.rotationIndex % this.weightedQueue.length];
    this.rotationIndex++;

    // Reset rotation when we've cycled through
    if (this.rotationIndex >= this.weightedQueue.length) {
      this.rotationIndex = 0;
      this.shuffleArray(this.weightedQueue); // Re-shuffle for variety
    }

    return allQueries[queryIndex].query;
  }

  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Scheduling
  // ───────────────────────────────────────────────────────────────────────────

  private calculateScanInterval(): number {
    // Calculate interval based on remaining budget and time
    const now = new Date();
    const hours = now.getHours();

    // Calculate remaining operating hours today
    let remainingHours: number;
    if (hours < this.config.operatingHours.start) {
      remainingHours = this.config.operatingHours.end - this.config.operatingHours.start;
    } else if (hours >= this.config.operatingHours.end) {
      remainingHours = 0;
    } else {
      remainingHours = this.config.operatingHours.end - hours;
    }

    if (remainingHours <= 0) {
      return this.config.maxScanIntervalMinutes;
    }

    // Use effective daily budget (dynamically calculated from API usage)
    const effectiveDailyBudget = this.getEffectiveDailyBudget();

    // Calculate remaining budget for today
    const remainingCredits = Math.max(
      0,
      effectiveDailyBudget - this.dailyStats.creditsUsed
    );

    if (remainingCredits <= 0) {
      logger.debug({
        event: 'DAILY_BUDGET_EXHAUSTED',
        effectiveDailyBudget,
        creditsUsedToday: this.dailyStats.creditsUsed,
      });
      return this.config.maxScanIntervalMinutes;
    }

    // Estimate credits per scan (average ~5 with caching, was ~15)
    const estimatedCreditsPerScan = this.config.estimatedCreditsPerScan || 5;
    const possibleScans = Math.floor(remainingCredits / estimatedCreditsPerScan);

    if (possibleScans <= 0) {
      return this.config.maxScanIntervalMinutes;
    }

    // Distribute scans across remaining hours
    const remainingMinutes = remainingHours * 60;
    const calculatedInterval = Math.floor(remainingMinutes / possibleScans);

    logger.debug({
      event: 'SCAN_INTERVAL_CALCULATED',
      effectiveDailyBudget,
      remainingCredits,
      creditsUsedToday: this.dailyStats.creditsUsed,
      remainingHours,
      possibleScans,
      calculatedInterval,
    });

    // Clamp to configured bounds
    return Math.max(
      this.config.minScanIntervalMinutes,
      Math.min(this.config.maxScanIntervalMinutes, calculatedInterval)
    );
  }

  private scheduleNextScan(): void {
    if (!this.isRunning) return;

    const intervalMinutes = this.calculateScanInterval();
    const intervalMs = intervalMinutes * 60 * 1000;

    // Add small random jitter (±30 seconds) to avoid predictable patterns
    const jitter = (Math.random() - 0.5) * 60 * 1000;
    const finalInterval = Math.max(intervalMs + jitter, 30000); // At least 30 seconds

    this.nextScanAt = new Date(Date.now() + finalInterval);

    this.scanTimer = setTimeout(() => {
      this.runScan();
    }, finalInterval);

    logger.debug({
      event: 'SCAN_SCHEDULED',
      nextScanAt: this.nextScanAt.toISOString(),
      intervalMinutes: Math.round(finalInterval / 60000),
    });
  }

  private isWithinOperatingHours(): boolean {
    const hour = new Date().getHours();
    return hour >= this.config.operatingHours.start && hour < this.config.operatingHours.end;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Statistics & History
  // ───────────────────────────────────────────────────────────────────────────

  private recordScanResult(result: ScanResult): void {
    // Update daily stats
    this.dailyStats.scansCompleted++;
    this.dailyStats.creditsUsed += result.creditsUsed;
    this.dailyStats.dealsFound += result.dealsFound;
    this.dailyStats.listingsProcessed += result.listingsProcessed;
    if (result.errors.length > 0) {
      this.dailyStats.errors += result.errors.length;
    }

    this.lastScanAt = result.completedAt;

    // Add to history
    this.scanHistory.unshift(result);
    if (this.scanHistory.length > this.MAX_HISTORY) {
      this.scanHistory.pop();
    }

    // Log detailed scan activity for the dashboard
    scanActivity.logScan({
      query: result.query,
      listingsFetched: result.listingsFetched,
      listingsProcessed: result.listingsProcessed,
      cardsMatched: result.cardsMatched,
      dealsFound: result.dealsFound,
      durationMs: result.durationMs,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });

    logger.info({
      event: 'SCAN_COMPLETE',
      query: result.query,
      listings: result.listingsFetched,
      processed: result.listingsProcessed,
      matched: result.cardsMatched,
      deals: result.dealsFound,
      credits: result.creditsUsed,
      durationMs: result.durationMs,
      dailyStats: {
        scans: this.dailyStats.scansCompleted,
        credits: this.dailyStats.creditsUsed,
        remaining: this.config.dailyCreditBudget - this.dailyStats.creditsUsed,
      },
    });
  }

  private createEmptyDailyStats(): DailyStats {
    return {
      date: new Date().toISOString().split('T')[0],
      scansCompleted: 0,
      creditsUsed: 0,
      dealsFound: 0,
      listingsProcessed: 0,
      errors: 0,
    };
  }

  private scheduleDailyReset(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      this.resetDailyStats();
      this.scheduleDailyReset(); // Schedule next reset
    }, msUntilMidnight);

    logger.debug({
      event: 'DAILY_RESET_SCHEDULED',
      nextReset: tomorrow.toISOString(),
    });
  }

  private resetDailyStats(): void {
    const previousStats = { ...this.dailyStats };
    
    logger.info({
      event: 'DAILY_STATS_RESET',
      previousDay: previousStats,
    });

    this.dailyStats = this.createEmptyDailyStats();
    this.rotationIndex = 0;
    this.buildWeightedQueue(); // Refresh queue for new day
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Deal Expiration
  // ───────────────────────────────────────────────────────────────────────────

  private startExpirationChecker(): void {
    // Check for expired deals every 5 minutes
    const checkInterval = 5 * 60 * 1000;

    this.expirationTimer = setInterval(() => {
      this.expireOldDeals();
    }, checkInterval);

    logger.debug({ event: 'EXPIRATION_CHECKER_STARTED', intervalMinutes: 5 });
  }

  private expireOldDeals(): void {
    const expirationMs = this.config.dealExpirationHours * 60 * 60 * 1000;
    const cutoffTime = Date.now() - expirationMs;

    const deals = dealStore.getActive();
    let expiredCount = 0;

    deals.forEach(deal => {
      const discoveredTime = deal.discoveredAt instanceof Date 
  ? deal.discoveredAt.getTime() 
  : new Date(deal.discoveredAt).getTime();
if (discoveredTime < cutoffTime) {
        dealStore.remove(deal.id);
        expiredCount++;
      }
    });

    if (expiredCount > 0) {
      logger.info({
        event: 'DEALS_EXPIRED',
        count: expiredCount,
        expirationHours: this.config.dealExpirationHours,
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Status Messages
  // ───────────────────────────────────────────────────────────────────────────

  private getStatusMessage(): string {
    if (!this.isRunning) {
      return 'Stopped';
    }

    if (this.currentQuery) {
      return `Scanning: ${this.currentQuery}`;
    }

    if (!this.isWithinOperatingHours()) {
      return 'Outside operating hours';
    }

    if (this.dailyStats.creditsUsed >= this.config.dailyCreditBudget) {
      return 'Daily budget exhausted';
    }

    if (this.nextScanAt) {
      const minutesUntilNext = Math.round(
        (this.nextScanAt.getTime() - Date.now()) / 60000
      );
      return `Next scan in ${minutesUntilNext}m`;
    }

    return 'Ready';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ───────────────────────────────────────────────────────────────────────────

  destroy(): void {
    this.stop();

    if (this.expirationTimer) {
      clearInterval(this.expirationTimer);
      this.expirationTimer = null;
    }

    if (this.dynamicQueryTimer) {
      clearInterval(this.dynamicQueryTimer);
      this.dynamicQueryTimer = null;
    }

    if (this.usageRefreshTimer) {
      clearInterval(this.usageRefreshTimer);
      this.usageRefreshTimer = null;
    }

    logger.info({ event: 'SCANNER_DESTROYED' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Export
// ─────────────────────────────────────────────────────────────────────────────

export const scannerLoop = new ScannerLoop();