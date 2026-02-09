// src/index.ts
// ═══════════════════════════════════════════════════════════════════════════
// PokeSnipe - Pokemon Card Arbitrage Detection System
// ═══════════════════════════════════════════════════════════════════════════

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { validateConfigOrExit } from './config/validation.js';
import { logger } from './utils/logger.js';
import { AppError, getErrorMessage } from './utils/errors.js';

// Middleware
import { rateLimiter, scanRateLimiterMiddleware, destroyRateLimiters } from './middleware/index.js';

// Services
import { expansionService } from './services/expansion/index.js';
import { scannerLoop } from './services/scanner/index.js';
import { initializePool, initializeSchema, closePool } from './services/database/index.js';
import { cache } from './services/cache/index.js';
import { performHealthCheck, livenessCheck, readinessCheck } from './services/health/index.js';
import { getPrometheusMetrics, getMetricsJson } from './services/metrics/index.js';
import { corpusService } from './services/training/corpus.js';

// Routes
import scrydexRoutes from './routes/scrydex.js';
import ebayRoutes from './routes/ebay.js';
import parserRoutes from './routes/parser.js';
import expansionRoutes from './routes/expansion.js';
import pricingRoutes from './routes/pricing.js';
import arbitrageRoutes from './routes/arbitrage.js';
import scannerRoutes from './routes/scanner.js';
import trainingRoutes from './routes/training.js';
import { preferencesRouter } from './routes/preferences.js';
import telegramRoutes from './routes/telegram.js';

// ES Module dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────

app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Request logging (API routes only)
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    logger.debug({
      event: 'HTTP_REQUEST',
      method: req.method,
      path: req.path,
    });
  }
  next();
});

// Apply rate limiting to API routes (except health/metrics)
app.use('/api', rateLimiter);

// Stricter rate limiting for scan endpoints
app.use('/api/scanner/scan', scanRateLimiterMiddleware);
app.use('/api/ebay/search', scanRateLimiterMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// Health & Metrics Endpoints
// ─────────────────────────────────────────────────────────────────────────────

// Liveness probe (Kubernetes/Railway)
app.get('/livez', (_req, res) => {
  res.json(livenessCheck());
});

// Readiness probe (Kubernetes/Railway)
app.get('/readyz', async (_req, res) => {
  const result = await readinessCheck();
  res.status(result.ready ? 200 : 503).json(result);
});

// Comprehensive health check
app.get('/health', async (_req, res) => {
  const health = await performHealthCheck();
  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Prometheus metrics endpoint
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(await getPrometheusMetrics());
});

// JSON metrics (for debugging)
app.get('/metrics/json', async (_req, res) => {
  res.json(await getMetricsJson());
});

// ─────────────────────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────────────────────

app.use('/api/scrydex', scrydexRoutes);
app.use('/api/ebay', ebayRoutes);
app.use('/api/parser', parserRoutes);
app.use('/api/expansion', expansionRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/arbitrage', arbitrageRoutes);
app.use('/api/scanner', scannerRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/preferences', preferencesRouter);
app.use('/api/telegram', telegramRoutes);

// Catch-all: Serve index.html for non-API routes (SPA support)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling Middleware
// ─────────────────────────────────────────────────────────────────────────────

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // Log the error
  logger.error({
    event: 'UNHANDLED_ERROR',
    error: getErrorMessage(err),
    stack: err.stack,
  });

  // Handle AppError instances
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(config.isDev && { context: err.context }),
    });
    return;
  }

  // Handle other errors
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: config.isDev ? err.message : 'An unexpected error occurred',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║   ██████╗  ██████╗ ██╗  ██╗███████╗███████╗███╗   ██╗██╗██████╗ ███████╗  ║
║   ██╔══██╗██╔═══██╗██║ ██╔╝██╔════╝██╔════╝████╗  ██║██║██╔══██╗██╔════╝  ║
║   ██████╔╝██║   ██║█████╔╝ █████╗  ███████╗██╔██╗ ██║██║██████╔╝█████╗    ║
║   ██╔═══╝ ██║   ██║██╔═██╗ ██╔══╝  ╚════██║██║╚██╗██║██║██╔═══╝ ██╔══╝    ║
║   ██║     ╚██████╔╝██║  ██╗███████╗███████║██║ ╚████║██║██║     ███████╗  ║
║   ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═══╝╚═╝╚═╝     ╚══════╝  ║
║                                                                           ║
║   APEX TACTICAL // UK ARBITRAGE DETECTION SYSTEM                          ║
╚═══════════════════════════════════════════════════════════════════════════╝
  `);

  // Validate configuration before proceeding
  validateConfigOrExit();

  try {
    // Initialize PostgreSQL database (if DATABASE_URL is set)
    logger.info('Initializing database connection...');
    const dbConnected = await initializePool();
    if (dbConnected) {
      await initializeSchema();
      logger.info({
        event: 'DATABASE_READY',
        mode: 'postgresql',
      });
    } else {
      logger.info({
        event: 'DATABASE_READY',
        mode: 'memory',
        reason: 'No DATABASE_URL configured - using in-memory storage',
      });
    }

    // Log cache mode
    logger.info({
      event: 'CACHE_READY',
      mode: cache.getMode(),
    });

    // Initialize training corpus (loads from database if available)
    await corpusService.initialize();

    // Initialize expansion cache
    logger.info('Loading expansion cache...');
    await expansionService.initialize();
    const stats = expansionService.getStats();
    logger.info({
      event: 'EXPANSION_CACHE_LOADED',
      totalExpansions: stats.totalExpansions,
      englishExpansions: stats.englishExpansions,
      japaneseExpansions: stats.japaneseExpansions,
    });

    // Initialize dynamic queries now that expansion cache is loaded
    scannerLoop.initializeDynamicQueries();

    // Start Express server
    app.listen(config.port, () => {
      logger.info({
        event: 'SERVER_STARTED',
        port: config.port,
        environment: config.nodeEnv,
        dashboard: `http://localhost:${config.port}`,
        health: `http://localhost:${config.port}/health`,
        metrics: `http://localhost:${config.port}/metrics`,
        database: dbConnected ? 'postgresql' : 'memory',
        cache: cache.getMode(),
      });

      // Auto-start scanner if configured (disabled by default)
      if (config.scanner.autoStart) {
        logger.info('Auto-starting scanner...');
        scannerLoop.start();
      } else {
        logger.info('Scanner ready. Start manually via POST /api/scanner/start or dashboard.');
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Graceful Shutdown
// ─────────────────────────────────────────────────────────────────────────────

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully...`);

  // Stop scanner
  scannerLoop.destroy();

  // Cleanup rate limiters
  destroyRateLimiters();

  // Close cache connections
  await cache.close();

  // Close database pool
  await closePool();

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error({
    event: 'UNCAUGHT_EXCEPTION',
    error: getErrorMessage(error),
    stack: error.stack,
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error({
    event: 'UNHANDLED_REJECTION',
    error: getErrorMessage(reason),
  });
});

bootstrap();
