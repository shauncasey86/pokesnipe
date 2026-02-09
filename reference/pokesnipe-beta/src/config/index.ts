// src/config/index.ts
// ═══════════════════════════════════════════════════════════════════════════
// Centralized Configuration - All settings in one place
// ═══════════════════════════════════════════════════════════════════════════

import dotenv from 'dotenv';

dotenv.config();

// Helper to parse integers with defaults
const parseIntEnv = (value: string | undefined, defaultValue: number): number => {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

export const config = {
  // ─────────────────────────────────────────────────────────────────────────
  // Server Configuration
  // ─────────────────────────────────────────────────────────────────────────
  port: parseIntEnv(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  // ─────────────────────────────────────────────────────────────────────────
  // Scrydex API Configuration
  // ─────────────────────────────────────────────────────────────────────────
  scrydex: {
    apiKey: process.env.SCRYDEX_API_KEY || '',
    teamId: process.env.SCRYDEX_TEAM_ID || '',
    baseUrl: process.env.SCRYDEX_BASE_URL || 'https://api.scrydex.com',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // eBay API Configuration
  // ─────────────────────────────────────────────────────────────────────────
  ebay: {
    clientId: process.env.EBAY_CLIENT_ID || '',
    clientSecret: process.env.EBAY_CLIENT_SECRET || '',
    environment: (process.env.EBAY_ENVIRONMENT || 'production') as 'production' | 'sandbox',
    marketplace: 'EBAY_GB',
    category: '183454', // CCG Individual Cards
  },

  // ─────────────────────────────────────────────────────────────────────────
  // eBay Partner Network (Affiliate)
  // ─────────────────────────────────────────────────────────────────────────
  epn: {
    campaignId: process.env.EPN_CAMPAIGN_ID || '',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Database Configuration (PostgreSQL)
  // ─────────────────────────────────────────────────────────────────────────
  database: {
    url: process.env.DATABASE_URL || process.env.POSTGRES_URL || '',
    poolMax: parseIntEnv(process.env.PG_POOL_MAX, 10),
    ssl: process.env.NODE_ENV === 'production',
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Redis Cache Configuration
  // ─────────────────────────────────────────────────────────────────────────
  redis: {
    url: process.env.REDIS_URL || '',
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'pokesnipe:',
    maxRetries: 3,
    retryDelayMs: 200,
    maxRetryDelayMs: 2000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Scanner Configuration
  // ─────────────────────────────────────────────────────────────────────────
  scanner: {
    // Credit budget: 50,000/month ÷ 30 days = 1,666/day, use 1,400 for safety
    dailyCreditBudget: parseIntEnv(process.env.SCANNER_DAILY_BUDGET, 1400),

    // Scan interval bounds (in minutes)
    minScanIntervalMinutes: parseIntEnv(process.env.SCANNER_MIN_INTERVAL, 2),
    maxScanIntervalMinutes: parseIntEnv(process.env.SCANNER_MAX_INTERVAL, 30),

    // Listings per scan (balance between coverage and credits)
    listingsPerScan: parseIntEnv(process.env.SCANNER_LISTINGS_PER_SCAN, 50),

    // Operating hours (UK time)
    operatingHours: {
      start: parseIntEnv(process.env.SCANNER_HOURS_START, 7),   // 7 AM
      end: parseIntEnv(process.env.SCANNER_HOURS_END, 23),      // 11 PM
    },

    // Auto-start scanner on boot
    autoStart: process.env.SCANNER_AUTO_START === 'true',

    // Deal expiration (in hours)
    dealExpirationHours: parseIntEnv(process.env.DEAL_EXPIRATION_HOURS, 48),

    // Dynamic query refresh interval (in hours)
    dynamicQueryRefreshHours: parseIntEnv(process.env.DYNAMIC_QUERY_REFRESH_HOURS, 24),

    // Estimated credits per scan (for interval calculation)
    estimatedCreditsPerScan: 5,

    // Maximum scan history entries
    maxHistoryEntries: 100,

    // Deal expiration check interval (in minutes)
    expirationCheckIntervalMinutes: 5,

    // Jitter for scan scheduling (in seconds)
    schedulingJitterSeconds: 30,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Arbitrage Thresholds
  // ─────────────────────────────────────────────────────────────────────────
  arbitrage: {
    tiers: {
      premium: { minDiscount: 10, minValue: 1000 },
      high: { minDiscount: 15, minValue: 500 },
      standard: { minDiscount: 20, minValue: 0 },
    },
    // Minimum confidence score for title parsing (0-100)
    minParseConfidence: 60,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Cache TTLs (in seconds)
  // ─────────────────────────────────────────────────────────────────────────
  cache: {
    defaultTtlSeconds: 3600,        // 1 hour
    cardTtlSeconds: 3600,           // 1 hour
    cardWithPricesTtlSeconds: 86400, // 24 hours
    expansionTtlSeconds: 86400,     // 24 hours
    exchangeRateTtlSeconds: 21600,  // 6 hours
    failedQueryTtlSeconds: 3600,    // 1 hour (for failed Scrydex queries)
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Rate Limiting
  // ─────────────────────────────────────────────────────────────────────────
  rateLimit: {
    // Window in milliseconds
    windowMs: parseIntEnv(process.env.RATE_LIMIT_WINDOW_MS, 60000), // 1 minute
    // Max requests per window
    maxRequests: parseIntEnv(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
    // Skip rate limiting in development
    skipInDev: process.env.RATE_LIMIT_SKIP_DEV !== 'false',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Logging
  // ─────────────────────────────────────────────────────────────────────────
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    maxActivityLogEntries: 500,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Dynamic Query Configuration
  // ─────────────────────────────────────────────────────────────────────────
  dynamicQueries: {
    // Days to consider for recent releases
    recentReleaseDays: 90,
    veryRecentDays: 30,
    brandNewDays: 14,

    // Weight tiers for dynamic queries
    weights: {
      brandNew: 6,      // < 14 days
      veryRecent: 5,    // < 30 days
      recent: 3,        // < 90 days
    },

    // Max sets to create chase card queries for
    maxChaseSets: 5,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Exchange Rate
  // ─────────────────────────────────────────────────────────────────────────
  exchangeRate: {
    fallbackRate: 1.27, // Fallback USD to GBP rate if API fails
    apiUrl: 'https://api.frankfurter.app/latest',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Memory Store Limits (fallback storage)
  // ─────────────────────────────────────────────────────────────────────────
  memoryStore: {
    maxDeals: 500,
    dealExpiryMs: 24 * 60 * 60 * 1000, // 24 hours
  },
} as const;

// Type exports for use in other modules
export type Config = typeof config;
export type ScannerConfig = typeof config.scanner;
export type ArbitrageConfig = typeof config.arbitrage;
export type CacheConfig = typeof config.cache;
