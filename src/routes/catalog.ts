import { Router } from 'express';
import { parsePagination } from '../utils/pagination.js';
import {
  getExpansions,
  getExpansionDetail,
  searchCards,
  getCardDetail,
  getTrending,
} from '../services/catalog/queries.js';

export const catalogRouter = Router();

// GET /api/catalog/expansions
catalogRouter.get('/expansions', async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query as Record<string, string>);
    const sort = (req.query.sort as string) || '-release_date';
    const series = req.query.series as string | undefined;

    const result = await getExpansions({ sort, series, page, limit, offset });
    res.json({ data: result.data, total: result.total, page, limit });
  } catch (err) {
    console.error('GET /expansions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/catalog/expansions/:id
catalogRouter.get('/expansions/:id', async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query as Record<string, string>);
    const sort = (req.query.sort as string) || 'number';
    const rarity = req.query.rarity as string | undefined;

    const result = await getExpansionDetail(req.params.id, { sort, rarity, page, limit, offset });

    if (!result.expansion) {
      res.status(404).json({ error: 'Expansion not found' });
      return;
    }

    res.json({
      expansion: result.expansion,
      cards: { data: result.cards.data, total: result.cards.total, page, limit },
    });
  } catch (err) {
    console.error('GET /expansions/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/catalog/cards/search
catalogRouter.get('/cards/search', async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q || q.trim().length === 0) {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    const { page, limit, offset } = parsePagination(req.query as Record<string, string>);
    const result = await searchCards(q.trim(), { page, limit, offset });
    res.json({ data: result.data, total: result.total, page, limit, query: result.query });
  } catch (err) {
    console.error('GET /cards/search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/catalog/cards/:id
catalogRouter.get('/cards/:id', async (req, res) => {
  try {
    const result = await getCardDetail(req.params.id);

    if (!result.card) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }

    res.json(result);
  } catch (err) {
    console.error('GET /cards/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/catalog/trending
catalogRouter.get('/trending', async (req, res) => {
  try {
    const period = req.query.period as string | undefined;
    const direction = req.query.direction as string | undefined;
    const condition = req.query.condition as string | undefined;
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const result = await getTrending({ period, direction, minPrice, condition, limit });
    res.json(result);
  } catch (err) {
    console.error('GET /trending error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
