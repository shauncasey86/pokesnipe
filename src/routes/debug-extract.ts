import { Router } from 'express';
import { getAccessToken, searchItems, getItem, getBudgetStatus } from '../services/ebay/index.js';
import { extractSignals } from '../services/extraction/index.js';

const debugExtractRouter = Router();

/**
 * GET /api/debug/test-extract?q=charizard&limit=3
 *
 * Searches eBay, enriches the first N results via getItem,
 * then runs each through the Stage 6 extraction pipeline.
 */
debugExtractRouter.get('/api/debug/test-extract', async (req, res) => {
  const query = (req.query['q'] as string) || 'pokemon card';
  const limit = Math.min(parseInt(req.query['limit'] as string) || 3, 10);

  try {
    await getAccessToken();

    const results = await searchItems(query, limit);
    if (!results?.itemSummaries?.length) {
      res.json({ ok: false, error: 'No search results', budget: getBudgetStatus() });
      return;
    }

    const extractions = [];

    for (const summary of results.itemSummaries.slice(0, limit)) {
      // Enrich with getItem for localizedAspects + conditionDescriptors
      const detail = await getItem(summary.itemId);

      const listing = {
        itemId: summary.itemId,
        title: summary.title,
        conditionDescriptors: (detail?.conditionDescriptors ?? []).map((d) => ({
          name: d.name,
          values: d.values.map((v) => v.content),
        })),
        localizedAspects: detail?.localizedAspects ?? null,
      };

      const result = extractSignals(listing);

      extractions.push({
        input: {
          itemId: summary.itemId,
          title: summary.title,
          price: summary.price,
        },
        raw: {
          localizedAspects: detail?.localizedAspects ?? null,
          conditionDescriptors: detail?.conditionDescriptors ?? null,
        },
        extraction: result,
      });
    }

    const accepted = extractions.filter((e) => !e.extraction.rejected).length;
    const rejected = extractions.filter((e) => e.extraction.rejected).length;

    res.json({
      ok: true,
      query,
      summary: { total: extractions.length, accepted, rejected },
      extractions,
      budget: getBudgetStatus(),
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      budget: getBudgetStatus(),
    });
  }
});

export { debugExtractRouter };
