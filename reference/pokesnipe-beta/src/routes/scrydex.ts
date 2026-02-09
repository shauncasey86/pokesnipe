// src/routes/scrydex.ts

import { Router, Request, Response } from 'express';
import { scrydex } from '../services/scrydex/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/cards/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, prices } = req.query;

    if (!name || typeof name !== 'string') {
      res.status(400).json({ status: 'error', message: 'Query parameter "name" is required' });
      return;
    }

    const result = await scrydex.searchByName(name, { includePrices: prices === 'true' });

    res.json({ status: 'ok', count: result.data.length, totalCount: result.totalCount, data: result.data });
  } catch (error) {
    logger.error('Failed to search cards:', error);
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Failed to search cards' });
  }
});

router.get('/cards/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { prices } = req.query;

    const card = await scrydex.getCard(id, prices === 'true');

    if (!card) {
      res.status(404).json({ status: 'error', message: `Card not found: ${id}` });
      return;
    }

    const marketPrice = scrydex.extractMarketPrice(card);
    res.json({ status: 'ok', data: card, marketPrice });
  } catch (error) {
    logger.error('Failed to fetch card:', error);
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Failed to fetch card' });
  }
});

router.get('/expansions', async (req: Request, res: Response): Promise<void> => {
  try {
    const { language } = req.query;

    if (language === 'english') {
      const expansions = await scrydex.getAllEnglishExpansions();
      res.json({ status: 'ok', count: expansions.length, data: expansions });
      return;
    }

    const expansions = await scrydex.searchExpansions();
    res.json({ status: 'ok', count: expansions.data.length, totalCount: expansions.totalCount, data: expansions.data });
  } catch (error) {
    logger.error('Failed to fetch expansions:', error);
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Failed to fetch expansions' });
  }
});

router.get('/expansions/:id/cards', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { prices, page, pageSize } = req.query;

    const result = await scrydex.getCardsFromExpansion(id, {
      includePrices: prices === 'true',
      page: page ? parseInt(page as string, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
    });

    res.json({ status: 'ok', page: result.page, pageSize: result.pageSize, totalCount: result.totalCount, count: result.data.length, data: result.data });
  } catch (error) {
    logger.error('Failed to fetch expansion cards:', error);
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Failed to fetch expansion cards' });
  }
});

router.get('/usage', async (_req: Request, res: Response): Promise<void> => {
  try {
    logger.info('Fetching Scrydex usage...');
    const usage = await scrydex.getUsage();
    logger.info({ event: 'SCRYDEX_USAGE_RESULT', usage });

    if (!usage) {
      logger.warn('Scrydex getUsage returned null');
      res.status(500).json({ status: 'error', message: 'Failed to fetch usage data' });
      return;
    }

    res.json({ status: 'ok', data: usage });
  } catch (error) {
    logger.error('Failed to fetch Scrydex usage:', error);
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Failed to fetch usage' });
  }
});

router.get('/cache/stats', (_req: Request, res: Response): void => {
  res.json({ status: 'ok', cacheSize: scrydex.getCacheSize() });
});

router.post('/cache/clear', (_req: Request, res: Response): void => {
  scrydex.clearCache();
  res.json({ status: 'ok', message: 'Cache cleared' });
});

export default router;