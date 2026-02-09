// src/routes/arbitrage.ts
// ═══════════════════════════════════════════════════════════════════════════
// Arbitrage API Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { dealStore } from '../services/arbitrage/deal-store.js';
import { exchangeRate } from '../services/currency/exchange-rate.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/arbitrage/deals - Get all current deals
// ─────────────────────────────────────────────────────────────────────────────

router.get('/deals', async (_req: Request, res: Response) => {
  try {
    const storageMode = dealStore.getMode();
    const [deals, rates] = await Promise.all([
      dealStore.getActiveAsync(),
      exchangeRate.getRates(),
    ]);

    // Log for debugging deal storage issues
    logger.debug('DEALS_FETCHED', {
      count: deals.length,
      storageMode,
    });

    res.json({
      status: 'ok',
      deals,
      count: deals.length,
      rate: rates.rates.USD,
      rateLive: rates.isLive,
      storageMode, // Include in response for frontend debugging
    });
  } catch (error) {
    logger.error('Failed to get deals', { error });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch deals',
      deals: [],
      count: 0,
      rate: 1.27,
      rateLive: false,
      storageMode: 'error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/arbitrage/clear - Clear all deals
// ─────────────────────────────────────────────────────────────────────────────

router.post('/clear', async (_req: Request, res: Response) => {
  try {
    const deals = await dealStore.getActiveAsync();
    const count = deals.length;
    await dealStore.clearAsync();

    logger.info('DEALS_CLEARED', { count });

    res.json({
      status: 'ok',
      cleared: count,
    });
  } catch (error) {
    logger.error('Failed to clear deals', { error });
    res.status(500).json({
      status: 'error',
      message: 'Failed to clear deals',
      cleared: 0,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/arbitrage/stats - Get deal statistics
// ─────────────────────────────────────────────────────────────────────────────

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await dealStore.getStatsAsync();

    res.json({
      status: 'ok',
      stats,
      storage: dealStore.getMode(),
    });
  } catch (error) {
    logger.error('Failed to get stats', { error });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get statistics',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/arbitrage/deal/:id - Get a specific deal
// ─────────────────────────────────────────────────────────────────────────────

router.get('/deal/:id', async (req: Request, res: Response) => {
  try {
    const deal = await dealStore.getByIdAsync(req.params.id);

    if (!deal) {
      res.status(404).json({
        status: 'error',
        message: 'Deal not found',
      });
      return;
    }

    res.json({
      status: 'ok',
      deal,
    });
  } catch (error) {
    logger.error('Failed to get deal', { error, dealId: req.params.id });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get deal',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/arbitrage/deal/:id - Remove a deal (mark as sold/dismiss)
// ─────────────────────────────────────────────────────────────────────────────

router.delete('/deal/:id', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.id;
    const removed = await dealStore.removeAsync(dealId);

    if (!removed) {
      res.status(404).json({
        status: 'error',
        message: 'Deal not found',
      });
      return;
    }

    logger.info('DEAL_REMOVED', { dealId, reason: 'user_marked_sold' });

    res.json({
      status: 'ok',
      removed: true,
      dealId,
    });
  } catch (error) {
    logger.error('Failed to remove deal', { error, dealId: req.params.id });
    res.status(500).json({
      status: 'error',
      message: 'Failed to remove deal',
    });
  }
});

export default router;