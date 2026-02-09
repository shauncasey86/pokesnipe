// src/routes/pricing.ts

import { Router, Request, Response } from 'express';
import { expansionService } from '../services/expansion/index.js';
import { titleParser } from '../services/parser/index.js';
import { scrydex } from '../services/scrydex/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/card/:cardId', async (req: Request, res: Response): Promise<void> => {
  const { cardId } = req.params;

  try {
    const card = await scrydex.getCard(cardId, true);

    if (!card) {
      res.status(404).json({ status: 'error', message: `Card not found: ${cardId}` });
      return;
    }

    const prices = scrydex.extractPrices(card);
    const marketPrice = scrydex.extractMarketPrice(card);

    res.json({
      status: 'ok',
      data: { cardId: card.id, cardName: card.name, expansion: card.expansion?.name, priceCount: prices.length, marketPrice, prices },
    });
  } catch (error) {
    logger.error(`Price lookup failed for ${cardId}:`, error);
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/lookup', async (req: Request, res: Response): Promise<void> => {
  const expansionId = req.query.expansion as string;
  const cardNumber = req.query.number as string;

  if (!expansionId || !cardNumber) {
    res.status(400).json({ status: 'error', message: 'Missing required params: expansion and number' });
    return;
  }

  try {
    const result = await scrydex.searchCards({
      q: `expansion.id:${expansionId} number:${cardNumber}`,
      include: 'prices',
      pageSize: 5,
    });

    if (!result.data || result.data.length === 0) {
      res.status(404).json({ status: 'error', message: `No card found for expansion:${expansionId} number:${cardNumber}` });
      return;
    }

    const card = result.data[0];
    const prices = scrydex.extractPrices(card);
    const marketPrice = scrydex.extractMarketPrice(card);

    res.json({
      status: 'ok',
      data: { cardId: card.id, cardName: card.name, expansion: card.expansion?.name, priceCount: prices.length, marketPrice, prices },
    });
  } catch (error) {
    logger.error(`Price lookup failed:`, error);
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/parse-and-lookup', async (req: Request, res: Response): Promise<void> => {
  const { title } = req.body;

  if (!title) {
    res.status(400).json({ status: 'error', message: 'Missing "title" in request body' });
    return;
  }

  try {
    const parsed = titleParser.parse(title);

    if (!parsed.cardNumber) {
      res.json({ status: 'ok', data: { success: false, stage: 'parse', error: 'Could not extract card number from title', parsed } });
      return;
    }

    let expansionId: string | null = null;
    if (parsed.setName) {
      const expansionMatch = expansionService.match(parsed.setName);
      if (expansionMatch.success && expansionMatch.match) {
        expansionId = expansionMatch.match.expansion.id;
      }
    }

    if (!expansionId) {
      res.json({ status: 'ok', data: { success: false, stage: 'expansion_match', error: 'Could not match expansion from title', parsed } });
      return;
    }

    const result = await scrydex.searchCards({
      q: `expansion.id:${expansionId} number:${parsed.cardNumber}`,
      include: 'prices',
      pageSize: 5,
    });

    if (!result.data || result.data.length === 0) {
      res.json({ status: 'ok', data: { success: false, stage: 'scrydex', error: 'No card found in Scrydex', parsed, expansionId } });
      return;
    }

    const card = result.data[0];
    const prices = scrydex.extractPrices(card);
    const marketPrice = scrydex.extractMarketPrice(card);

    res.json({
      status: 'ok',
      data: {
        success: true,
        stage: 'complete',
        parsed: {
          cardName: parsed.cardName,
          cardNumber: parsed.cardNumber,
          setName: parsed.setName,
          isGraded: parsed.isGraded,
          gradingCompany: parsed.gradingCompany,
          grade: parsed.grade,
          condition: parsed.condition,
          confidence: parsed.confidence,
        },
        expansionMatch: { id: expansionId },
        pricing: { cardId: card.id, cardName: card.name, priceCount: prices.length, marketPrice, prices },
      },
    });
  } catch (error) {
    logger.error(`Parse-and-lookup failed for "${title}":`, error);
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/volatility', (req: Request, res: Response): void => {
  const expansionId = req.query.expansion as string;

  if (!expansionId) {
    res.status(400).json({ status: 'error', message: 'Missing "expansion" query param' });
    return;
  }

  const expansion = expansionService.getById(expansionId);

  if (!expansion) {
    res.status(404).json({ status: 'error', message: `Expansion not found: ${expansionId}` });
    return;
  }

  const releaseDate = new Date(expansion.releaseDate);
  const ageDays = (Date.now() - releaseDate.getTime()) / (1000 * 60 * 60 * 24);

  let volatility: string;
  let ttlHours: number;

  if (ageDays > 365 * 5) {
    volatility = 'vintage';
    ttlHours = 168;
  } else if (ageDays > 60) {
    volatility = 'modern';
    ttlHours = 72;
  } else if (ageDays > 14) {
    volatility = 'recent';
    ttlHours = 24;
  } else {
    volatility = 'new_release';
    ttlHours = 24;
  }

  res.json({
    status: 'ok',
    data: {
      expansion: { id: expansion.id, name: expansion.name, series: expansion.series, releaseDate: expansion.releaseDate },
      volatility,
      cacheTtlHours: ttlHours,
      gradedCacheTtlHours: 168,
    },
  });
});

export default router;