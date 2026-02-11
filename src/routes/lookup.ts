import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pino from 'pino';
import { validate } from '../middleware/validation.js';
import { getItem } from '../services/ebay/client.js';
import { trackCall, canMakeCall } from '../services/ebay/budget.js';
import { extractSignals } from '../services/extraction/index.js';
import { matchListing } from '../services/matching/index.js';
import { calculateProfit } from '../services/pricing/pricing-engine.js';
import { getValidRate } from '../services/exchange-rate/exchange-rate-service.js';
import { calculateLiquidity } from '../services/liquidity/index.js';

const log = pino({ name: 'lookup' });
const router = Router();

const lookupSchema = z.object({
  ebayUrl: z.string().url().refine(
    (url) => /ebay\.(co\.uk|com)/.test(url),
    { message: 'Must be an eBay URL' },
  ),
});

/**
 * POST /api/lookup — Evaluate a single eBay listing through the full pipeline.
 *
 * Takes an eBay URL, extracts the item ID, fetches the listing,
 * and runs it through extraction → matching → pricing → liquidity.
 */
router.post('/', validate(lookupSchema), async (req: Request, res: Response) => {
  try {
    const { ebayUrl } = req.body;

    // Extract item ID from URL
    const itemIdMatch = ebayUrl.match(/\/itm\/(?:.*\/)?(\d+)/);
    if (!itemIdMatch) {
      return res.status(400).json({ error: 'Could not extract item ID from URL' });
    }
    const itemId = itemIdMatch[1];

    // Check budget
    if (!canMakeCall()) {
      return res.status(429).json({ error: 'eBay API budget exhausted for today' });
    }

    // Fetch full listing from eBay
    log.info({ itemId, ebayUrl }, 'Manual lookup started');
    const listing = await getItem(itemId);

    if (!listing) {
      return res.status(404).json({ error: 'eBay listing not found or budget exhausted' });
    }

    // Extract signals
    const extraction = extractSignals({
      itemId: listing.itemId,
      title: listing.title,
      conditionDescriptors: listing.conditionDescriptors?.map(d => ({
        name: d.name,
        values: d.values.map(v => v.content),
      })),
      localizedAspects: listing.localizedAspects?.map(a => ({
        name: a.name,
        value: a.value,
      })) || null,
    });

    // Match against card database (only if not rejected)
    const match = extraction.rejected || !extraction.listing
      ? null
      : await matchListing(extraction.listing);

    // Calculate profit (if matched)
    let profit = null;
    let liquidity = null;

    if (match) {
      const ebayPriceGBP = parseFloat(listing.price?.value || '0');
      const ebayShippingGBP = parseFloat(
        listing.shippingOptions?.[0]?.shippingCost?.value || '0',
      );
      const condition = (extraction.listing?.condition?.condition || 'LP') as 'NM' | 'LP' | 'MP' | 'HP';
      const exchangeRate = await getValidRate();

      profit = calculateProfit({
        ebayPriceGBP,
        shippingGBP: ebayShippingGBP,
        condition,
        variantPrices: match.variant.prices,
        exchangeRate,
      });

      // Calculate liquidity
      liquidity = calculateLiquidity(
        match.variant,
        condition,
        { concurrentSupply: 0, quantitySold: listing.quantitySold || 0 },
        null, // no velocity for manual lookup by default
      );
    }

    return res.json({
      itemId,
      ebayUrl,
      listing: {
        title: listing.title,
        price: listing.price,
        shipping: listing.shippingOptions?.[0]?.shippingCost,
        condition: listing.condition,
        conditionDescriptors: listing.conditionDescriptors,
        image: listing.image?.imageUrl,
        seller: listing.seller,
        quantitySold: listing.quantitySold,
      },
      signals: extraction.rejected
        ? { rejected: true, rejectReason: extraction.reason }
        : {
            rejected: false,
            cardNumber: extraction.listing?.cardNumber,
            condition: extraction.listing?.condition,
            variant: extraction.listing?.variant,
            expansion: extraction.listing?.setName,
            isGraded: extraction.listing?.condition?.isGraded,
          },
      match: match
        ? {
            cardId: match.card.scrydexCardId,
            cardName: match.card.name,
            cardNumber: match.card.number,
            variantName: match.variant.name,
            confidence: match.confidence,
          }
        : null,
      profit,
      liquidity: liquidity
        ? {
            composite: liquidity.composite,
            grade: liquidity.grade,
            signals: liquidity.signals,
          }
        : null,
    });
  } catch (err: any) {
    log.error({ err }, 'Lookup failed');

    if (err.status === 404 || err.message?.includes('not found')) {
      return res.status(404).json({ error: 'eBay listing not found' });
    }

    return res.status(500).json({ error: 'Lookup failed' });
  }
});

export default router;
