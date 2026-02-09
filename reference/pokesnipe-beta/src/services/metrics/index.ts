// src/services/metrics/index.ts
// ═══════════════════════════════════════════════════════════════════════════
// Prometheus Metrics - Exposes application metrics in Prometheus format
// ═══════════════════════════════════════════════════════════════════════════

import { scannerLoop } from '../scanner/index.js';
import { dealStore } from '../arbitrage/index.js';
import { getPool, isConnected as isDbConnected } from '../database/postgres.js';
import { cache } from '../cache/index.js';
import { getRateLimiterStats } from '../../middleware/rate-limiter.js';
import { config } from '../../config/index.js';

/**
 * Metric types for Prometheus
 */
type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

interface Metric {
  name: string;
  help: string;
  type: MetricType;
  value: number | string;
  labels?: Record<string, string>;
}

/**
 * Format a metric in Prometheus exposition format
 */
function formatMetric(metric: Metric): string {
  const lines: string[] = [];
  lines.push(`# HELP ${metric.name} ${metric.help}`);
  lines.push(`# TYPE ${metric.name} ${metric.type}`);

  if (metric.labels && Object.keys(metric.labels).length > 0) {
    const labelStr = Object.entries(metric.labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    lines.push(`${metric.name}{${labelStr}} ${metric.value}`);
  } else {
    lines.push(`${metric.name} ${metric.value}`);
  }

  return lines.join('\n');
}

/**
 * Collect all application metrics
 */
async function collectMetrics(): Promise<Metric[]> {
  const metrics: Metric[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  // Process Metrics
  // ─────────────────────────────────────────────────────────────────────────
  const memUsage = process.memoryUsage();

  metrics.push({
    name: 'pokesnipe_process_uptime_seconds',
    help: 'Process uptime in seconds',
    type: 'gauge',
    value: Math.floor(process.uptime()),
  });

  metrics.push({
    name: 'pokesnipe_process_memory_heap_used_bytes',
    help: 'Process heap memory used in bytes',
    type: 'gauge',
    value: memUsage.heapUsed,
  });

  metrics.push({
    name: 'pokesnipe_process_memory_heap_total_bytes',
    help: 'Process heap memory total in bytes',
    type: 'gauge',
    value: memUsage.heapTotal,
  });

  metrics.push({
    name: 'pokesnipe_process_memory_rss_bytes',
    help: 'Process resident set size in bytes',
    type: 'gauge',
    value: memUsage.rss,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scanner Metrics
  // ─────────────────────────────────────────────────────────────────────────
  const scannerStats = scannerLoop.getStats();

  metrics.push({
    name: 'pokesnipe_scanner_running',
    help: 'Whether the scanner is currently running (1=running, 0=stopped)',
    type: 'gauge',
    value: scannerStats.isRunning ? 1 : 0,
  });

  metrics.push({
    name: 'pokesnipe_scanner_scans_today_total',
    help: 'Total number of scans completed today',
    type: 'counter',
    value: scannerStats.scansToday,
  });

  metrics.push({
    name: 'pokesnipe_scanner_credits_used_today',
    help: 'Number of API credits used today',
    type: 'counter',
    value: scannerStats.creditsToday,
  });

  metrics.push({
    name: 'pokesnipe_scanner_credits_remaining',
    help: 'Number of API credits remaining for today',
    type: 'gauge',
    value: scannerStats.creditsRemaining,
  });

  metrics.push({
    name: 'pokesnipe_scanner_daily_budget',
    help: 'Daily credit budget',
    type: 'gauge',
    value: scannerStats.dailyBudget,
  });

  metrics.push({
    name: 'pokesnipe_scanner_deals_found_today',
    help: 'Number of deals found today',
    type: 'counter',
    value: scannerStats.dealsFoundToday,
  });

  metrics.push({
    name: 'pokesnipe_scanner_total_queries',
    help: 'Total number of search queries configured',
    type: 'gauge',
    value: scannerStats.totalQueries,
  });

  metrics.push({
    name: 'pokesnipe_scanner_static_queries',
    help: 'Number of static search queries',
    type: 'gauge',
    value: scannerStats.staticQueries,
  });

  metrics.push({
    name: 'pokesnipe_scanner_dynamic_queries',
    help: 'Number of dynamic search queries',
    type: 'gauge',
    value: scannerStats.dynamicQueries,
  });

  metrics.push({
    name: 'pokesnipe_scanner_scan_interval_minutes',
    help: 'Current scan interval in minutes',
    type: 'gauge',
    value: scannerStats.scanIntervalMinutes,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Deal Metrics
  // ─────────────────────────────────────────────────────────────────────────
  try {
    const dealStats = await dealStore.getStatsAsync();
    const dealCount = await dealStore.sizeAsync();

    metrics.push({
      name: 'pokesnipe_deals_active_total',
      help: 'Total number of active deals',
      type: 'gauge',
      value: dealCount,
    });

    metrics.push({
      name: 'pokesnipe_deals_premium',
      help: 'Number of premium tier deals',
      type: 'gauge',
      value: dealStats.byTier.premium,
    });

    metrics.push({
      name: 'pokesnipe_deals_high',
      help: 'Number of high tier deals',
      type: 'gauge',
      value: dealStats.byTier.high,
    });

    metrics.push({
      name: 'pokesnipe_deals_standard',
      help: 'Number of standard tier deals',
      type: 'gauge',
      value: dealStats.byTier.standard,
    });
  } catch {
    // Deal store might not be initialized yet
    metrics.push({
      name: 'pokesnipe_deals_active_total',
      help: 'Total number of active deals',
      type: 'gauge',
      value: 0,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Database Metrics
  // ─────────────────────────────────────────────────────────────────────────
  metrics.push({
    name: 'pokesnipe_database_connected',
    help: 'Whether the database is connected (1=connected, 0=disconnected)',
    type: 'gauge',
    value: isDbConnected() ? 1 : 0,
  });

  if (isDbConnected()) {
    const pool = getPool();
    if (pool) {
      metrics.push({
        name: 'pokesnipe_database_pool_total',
        help: 'Total number of connections in pool',
        type: 'gauge',
        value: pool.totalCount,
      });

      metrics.push({
        name: 'pokesnipe_database_pool_idle',
        help: 'Number of idle connections in pool',
        type: 'gauge',
        value: pool.idleCount,
      });

      metrics.push({
        name: 'pokesnipe_database_pool_waiting',
        help: 'Number of clients waiting for a connection',
        type: 'gauge',
        value: pool.waitingCount,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cache Metrics
  // ─────────────────────────────────────────────────────────────────────────
  const cacheMode = cache.getMode();

  metrics.push({
    name: 'pokesnipe_cache_mode',
    help: 'Cache mode (1=redis, 0=memory)',
    type: 'gauge',
    value: cacheMode === 'redis' ? 1 : 0,
  });

  try {
    const cacheSize = await cache.size();
    metrics.push({
      name: 'pokesnipe_cache_entries',
      help: 'Number of entries in cache',
      type: 'gauge',
      value: cacheSize,
    });
  } catch {
    metrics.push({
      name: 'pokesnipe_cache_entries',
      help: 'Number of entries in cache',
      type: 'gauge',
      value: 0,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Rate Limiter Metrics
  // ─────────────────────────────────────────────────────────────────────────
  const rateLimitStats = getRateLimiterStats();

  metrics.push({
    name: 'pokesnipe_ratelimit_api_entries',
    help: 'Number of entries in API rate limiter',
    type: 'gauge',
    value: rateLimitStats.api,
  });

  metrics.push({
    name: 'pokesnipe_ratelimit_scan_entries',
    help: 'Number of entries in scan rate limiter',
    type: 'gauge',
    value: rateLimitStats.scan,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Configuration Metrics
  // ─────────────────────────────────────────────────────────────────────────
  metrics.push({
    name: 'pokesnipe_config_deal_expiration_hours',
    help: 'Deal expiration time in hours',
    type: 'gauge',
    value: config.scanner.dealExpirationHours,
  });

  metrics.push({
    name: 'pokesnipe_config_listings_per_scan',
    help: 'Number of listings fetched per scan',
    type: 'gauge',
    value: config.scanner.listingsPerScan,
  });

  return metrics;
}

/**
 * Generate Prometheus metrics output
 */
export async function getPrometheusMetrics(): Promise<string> {
  const metrics = await collectMetrics();
  return metrics.map(formatMetric).join('\n\n') + '\n';
}

/**
 * Get metrics as JSON (for debugging/alternate consumers)
 */
export async function getMetricsJson(): Promise<Record<string, number | string | boolean>> {
  const metrics = await collectMetrics();
  const result: Record<string, number | string | boolean> = {};

  for (const metric of metrics) {
    result[metric.name] = metric.value;
  }

  return result;
}
