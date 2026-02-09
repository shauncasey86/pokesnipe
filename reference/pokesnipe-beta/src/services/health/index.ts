// src/services/health/index.ts
// ═══════════════════════════════════════════════════════════════════════════
// Health Check Service - Monitors all system dependencies
// ═══════════════════════════════════════════════════════════════════════════

import { getPool, isConnected as isDbConnected } from '../database/postgres.js';
import { cache } from '../cache/index.js';
import { scannerLoop } from '../scanner/index.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ComponentHealth {
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  components: {
    database: ComponentHealth;
    cache: ComponentHealth;
    scanner: ComponentHealth;
    ebayApi: ComponentHealth;
    scrydexApi: ComponentHealth;
  };
}

/**
 * Check PostgreSQL database health
 */
async function checkDatabase(): Promise<ComponentHealth> {
  if (!isDbConnected()) {
    return {
      status: 'degraded',
      message: 'Using in-memory storage (no PostgreSQL configured)',
    };
  }

  const pool = getPool();
  if (!pool) {
    return {
      status: 'unhealthy',
      message: 'Database pool not initialized',
    };
  }

  const start = Date.now();
  try {
    const result = await pool.query('SELECT 1 as health_check');
    const latencyMs = Date.now() - start;

    if (result.rows.length === 0) {
      return {
        status: 'unhealthy',
        latencyMs,
        message: 'Health check query returned no results',
      };
    }

    // Check pool stats
    const poolStats = {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };

    // Warn if pool is exhausted
    if (poolStats.waitingCount > 0) {
      return {
        status: 'degraded',
        latencyMs,
        message: 'Database connections waiting',
        details: poolStats,
      };
    }

    return {
      status: 'healthy',
      latencyMs,
      details: poolStats,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    return {
      status: 'unhealthy',
      latencyMs,
      message: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

/**
 * Check Redis cache health
 */
async function checkCache(): Promise<ComponentHealth> {
  const mode = cache.getMode();

  if (mode === 'memory') {
    return {
      status: 'degraded',
      message: 'Using in-memory cache (no Redis configured)',
      details: { mode },
    };
  }

  const start = Date.now();
  try {
    // Try a simple get/set operation
    const testKey = '_health_check_';
    await cache.set(testKey, 'ok', 10);
    const result = await cache.get<string>(testKey);
    await cache.delete(testKey);
    const latencyMs = Date.now() - start;

    if (result !== 'ok') {
      return {
        status: 'unhealthy',
        latencyMs,
        message: 'Cache read/write verification failed',
      };
    }

    return {
      status: 'healthy',
      latencyMs,
      details: { mode },
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    return {
      status: 'unhealthy',
      latencyMs,
      message: error instanceof Error ? error.message : 'Unknown cache error',
      details: { mode },
    };
  }
}

/**
 * Check scanner status
 */
function checkScanner(): ComponentHealth {
  const stats = scannerLoop.getStats();

  const details = {
    isRunning: stats.isRunning,
    status: stats.status,
    scansToday: stats.scansToday,
    creditsToday: stats.creditsToday,
    creditsRemaining: stats.creditsRemaining,
    dealsFoundToday: stats.dealsFoundToday,
  };

  // Scanner not running is not necessarily unhealthy
  if (!stats.isRunning) {
    return {
      status: 'healthy',
      message: 'Scanner stopped (manual mode)',
      details,
    };
  }

  // Check if budget is exhausted
  if (stats.creditsRemaining <= 0) {
    return {
      status: 'degraded',
      message: 'Daily credit budget exhausted',
      details,
    };
  }

  return {
    status: 'healthy',
    details,
  };
}

/**
 * Check eBay API health (passive check based on recent activity)
 */
function checkEbayApi(): ComponentHealth {
  // We don't want to make actual API calls for health checks
  // Instead, check if credentials are configured
  if (!config.ebay.clientId || !config.ebay.clientSecret) {
    return {
      status: 'unhealthy',
      message: 'eBay API credentials not configured',
    };
  }

  // Check recent scan history for eBay errors
  const history = scannerLoop.getHistory();
  const recentScans = history.slice(0, 10);

  if (recentScans.length === 0) {
    return {
      status: 'healthy',
      message: 'No recent scans to verify',
      details: { configured: true },
    };
  }

  const ebayErrors = recentScans.filter(scan =>
    scan.errors.some(err => err.toLowerCase().includes('ebay'))
  );

  if (ebayErrors.length > recentScans.length / 2) {
    return {
      status: 'unhealthy',
      message: 'High eBay API error rate in recent scans',
      details: { errorRate: `${ebayErrors.length}/${recentScans.length}` },
    };
  }

  if (ebayErrors.length > 0) {
    return {
      status: 'degraded',
      message: 'Some eBay API errors in recent scans',
      details: { errorRate: `${ebayErrors.length}/${recentScans.length}` },
    };
  }

  return {
    status: 'healthy',
    details: { configured: true, recentScans: recentScans.length },
  };
}

/**
 * Check Scrydex API health (passive check based on recent activity)
 */
function checkScrydexApi(): ComponentHealth {
  if (!config.scrydex.apiKey || !config.scrydex.teamId) {
    return {
      status: 'unhealthy',
      message: 'Scrydex API credentials not configured',
    };
  }

  // Check recent scan history for Scrydex errors
  const history = scannerLoop.getHistory();
  const recentScans = history.slice(0, 10);

  if (recentScans.length === 0) {
    return {
      status: 'healthy',
      message: 'No recent scans to verify',
      details: { configured: true },
    };
  }

  const scrydexErrors = recentScans.filter(scan =>
    scan.errors.some(err => err.toLowerCase().includes('scrydex'))
  );

  if (scrydexErrors.length > recentScans.length / 2) {
    return {
      status: 'unhealthy',
      message: 'High Scrydex API error rate in recent scans',
      details: { errorRate: `${scrydexErrors.length}/${recentScans.length}` },
    };
  }

  if (scrydexErrors.length > 0) {
    return {
      status: 'degraded',
      message: 'Some Scrydex API errors in recent scans',
      details: { errorRate: `${scrydexErrors.length}/${recentScans.length}` },
    };
  }

  return {
    status: 'healthy',
    details: { configured: true, recentScans: recentScans.length },
  };
}

/**
 * Determine overall health status from component statuses
 */
function determineOverallStatus(components: Record<string, ComponentHealth>): HealthStatus {
  const statuses = Object.values(components).map(c => c.status);

  if (statuses.some(s => s === 'unhealthy')) {
    return 'unhealthy';
  }

  if (statuses.some(s => s === 'degraded')) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Perform full health check of all system components
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  // Run checks in parallel where possible
  const [database, cacheHealth] = await Promise.all([
    checkDatabase(),
    checkCache(),
  ]);

  // These are sync checks
  const scanner = checkScanner();
  const ebayApi = checkEbayApi();
  const scrydexApi = checkScrydexApi();

  const components = {
    database,
    cache: cacheHealth,
    scanner,
    ebayApi,
    scrydexApi,
  };

  const result: HealthCheckResult = {
    status: determineOverallStatus(components),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '0.1.0',
    environment: config.nodeEnv,
    components,
  };

  const checkDuration = Date.now() - startTime;
  logger.debug({
    event: 'HEALTH_CHECK_COMPLETE',
    status: result.status,
    durationMs: checkDuration,
  });

  return result;
}

/**
 * Simple liveness check (is the process running)
 */
export function livenessCheck(): { alive: boolean; timestamp: string } {
  return {
    alive: true,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Readiness check (is the service ready to accept traffic)
 */
export async function readinessCheck(): Promise<{ ready: boolean; reason?: string }> {
  // Check critical dependencies
  const dbHealth = await checkDatabase();

  // Database must be at least degraded (in-memory is ok)
  if (dbHealth.status === 'unhealthy') {
    return { ready: false, reason: 'Database unhealthy' };
  }

  // Check if essential APIs are configured
  if (!config.ebay.clientId || !config.scrydex.apiKey) {
    return { ready: false, reason: 'Essential API credentials not configured' };
  }

  return { ready: true };
}
