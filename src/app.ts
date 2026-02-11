import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import healthRouter from './routes/health.js';
import { catalogRouter } from './routes/catalog.js';
import { debugEbayRouter } from './routes/debug-ebay.js';
import { debugExtractRouter } from './routes/debug-extract.js';
import { debugScanRouter } from './routes/debug-scan.js';
import { debugLiquidityRouter } from './routes/debug-liquidity.js';
import velocityRouter from './routes/velocity.js';
import { sessionMiddleware, authRouter, requireAuth } from './middleware/auth.js';
import dealsRouter from './routes/deals.js';
import lookupRouter from './routes/lookup.js';
import statusRouter from './routes/status.js';
import preferencesRouter from './routes/preferences.js';
import sseRouter from './routes/sse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = pino({ name: 'http' });

const app = express();

// Trust Railway's reverse proxy so secure cookies work behind TLS termination
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(express.json());
app.use(cookieParser());

// Session middleware (must be before auth-protected routes)
app.use(sessionMiddleware);

// Request logging middleware
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, 'request');
  next();
});

// Public routes (no auth required)
app.use(healthRouter);
app.use('/api/catalog', catalogRouter);

// Auth routes (no auth required)
app.use('/auth', authRouter);

// Debug routes (kept as-is from earlier stages)
app.use(debugEbayRouter);
app.use(debugExtractRouter);
app.use(debugScanRouter);
app.use(debugLiquidityRouter);

// Protected routes
app.use('/api/deals', requireAuth, sseRouter);        // SSE at /api/deals/stream (must be before deals CRUD)
app.use('/api/deals', requireAuth, dealsRouter);       // Deal CRUD at /api/deals/*
app.use('/api', requireAuth, velocityRouter);          // /api/deals/:id/velocity (protected)
app.use('/api/lookup', requireAuth, lookupRouter);
app.use('/api/status', requireAuth, statusRouter);
app.use('/api/preferences', requireAuth, preferencesRouter);

// Serve frontend static files
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));

// Catch-all: serve index.html for client-side routing (Express 5 syntax)
app.get('{*path}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

export default app;
