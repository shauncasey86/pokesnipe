import { Router } from 'express';
import pino from 'pino';
import { searchItems, getItem, canMakeCall, getBudgetStatus } from '../services/ebay/index.js';
import type { EbayItemSummary, EbayItemDetail } from '../services/ebay/index.js';
import { extractSignals } from '../services/extraction/index.js';
import { matchListing } from '../services/matching/index.js';
import { calculateProfit } from '../services/pricing/pricing-engine.js';
import { getValidRate } from '../services/exchange-rate/exchange-rate-service.js';
import { shouldEnrich } from '../services/scanner/enrichment-gate.js';
import { classifyTier } from '../services/scanner/tier-classifier.js';
import { getDedupStats } from '../services/scanner/deduplicator.js';

const log = pino({ name: 'debug-scan' });
const debugScanRouter = Router();

/**
 * Transform conditionDescriptors from eBay API format to extraction format.
 */
function toExtractionDescriptors(
  descriptors?: EbayItemDetail['conditionDescriptors'],
): Array<{ name: string; values: string[] }> | undefined {
  if (!descriptors?.length) return undefined;
  return descriptors.map((d) => ({
    name: d.name,
    values: d.values.map((v) => v.content),
  }));
}

/**
 * GET /api/debug/test-scan?limit=5&enrich=true
 *
 * Runs a mini scan cycle against live eBay + DB, returning detailed
 * per-listing results showing every pipeline stage.
 *
 * Query params:
 *   limit   — max listings to process (default 5, max 10)
 *   enrich  — whether to call getItem for Phase 2 (default true)
 */
debugScanRouter.get('/api/debug/test-scan', async (req, res) => {
  const limit = Math.min(parseInt(req.query['limit'] as string) || 5, 10);
  const enrichEnabled = req.query['enrich'] !== 'false';
  const startTime = Date.now();

  const output: {
    ok: boolean;
    timing: string;
    budget: unknown;
    dedupStats: unknown;
    exchangeRate: number | null;
    summary: { total: number; junk: number; noMatch: number; gated: number; enriched: number; deals: number; errors: number };
    listings: unknown[];
    error?: string;
  } = {
    ok: true,
    timing: '',
    budget: getBudgetStatus(),
    dedupStats: getDedupStats(),
    exchangeRate: null,
    summary: { total: 0, junk: 0, noMatch: 0, gated: 0, enriched: 0, deals: 0, errors: 0 },
    listings: [],
  };

  try {
    // Pre-flight checks
    if (!canMakeCall()) {
      res.json({ ...output, ok: false, error: 'Budget exhausted' });
      return;
    }

    let exchangeRate: number;
    try {
      exchangeRate = await getValidRate();
      output.exchangeRate = exchangeRate;
    } catch (err) {
      res.json({ ...output, ok: false, error: `Exchange rate unavailable: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }

    // Phase 1: Search
    const searchResult = await searchItems('pokemon card', limit);
    if (!searchResult?.itemSummaries?.length) {
      res.json({ ...output, ok: true, error: 'No listings returned from eBay search' });
      return;
    }

    output.summary.total = searchResult.itemSummaries.length;

    for (const listing of searchResult.itemSummaries) {
      const entry: Record<string, unknown> = {
        itemId: listing.itemId,
        title: listing.title,
        price: listing.price,
        shipping: listing.shippingOptions?.[0]?.shippingCost ?? null,
        stages: {},
      };

      try {
        // Stage 6: Extract signals (Phase 1 — title only)
        const extraction = extractSignals({
          itemId: listing.itemId,
          title: listing.title,
        });

        (entry['stages'] as Record<string, unknown>)['extraction'] = {
          rejected: extraction.rejected,
          reason: extraction.reason ?? null,
          signals: extraction.listing
            ? {
                cardName: extraction.listing.cardName,
                cardNumber: extraction.listing.cardNumber,
                variant: extraction.listing.variant,
                setName: extraction.listing.setName,
                condition: extraction.listing.condition,
                signalSources: extraction.listing.signalSources,
              }
            : null,
        };

        if (extraction.rejected) {
          (entry['stages'] as Record<string, unknown>)['outcome'] = 'REJECTED_JUNK';
          output.summary.junk++;
          output.listings.push(entry);
          continue;
        }

        const signals = extraction.listing!;

        // Stage 7: Match against card DB
        const match = await matchListing(signals);

        (entry['stages'] as Record<string, unknown>)['matching'] = match
          ? {
              card: match.card,
              variant: { id: match.variant.id, name: match.variant.name },
              confidence: match.confidence,
              strategy: match.strategy,
              variantMethod: match.variantMethod,
            }
          : null;

        if (!match) {
          (entry['stages'] as Record<string, unknown>)['outcome'] = 'NO_MATCH';
          output.summary.noMatch++;
          output.listings.push(entry);
          continue;
        }

        // Stage 4: Quick profit estimate
        const ebayPriceGBP = parseFloat(listing.price?.value || '0');
        const ebayShippingGBP = parseFloat(listing.shippingOptions?.[0]?.shippingCost?.value || '0');
        const titleCondition = signals.condition?.condition || 'LP';

        const quickProfit = calculateProfit({
          ebayPriceGBP,
          shippingGBP: ebayShippingGBP,
          condition: titleCondition,
          variantPrices: match.variant.prices,
          exchangeRate,
        });

        (entry['stages'] as Record<string, unknown>)['quickProfit'] = quickProfit
          ? {
              totalCostGBP: quickProfit.totalCostGBP,
              marketValueGBP: quickProfit.marketValueGBP,
              profitGBP: quickProfit.profitGBP,
              profitPercent: quickProfit.profitPercent,
            }
          : null;

        if (!quickProfit) {
          (entry['stages'] as Record<string, unknown>)['outcome'] = 'NO_PROFIT_DATA';
          output.summary.noMatch++;
          output.listings.push(entry);
          continue;
        }

        // Stage 8: Enrichment gate
        const gateResult = shouldEnrich(
          { titleOnlyProfitPercent: quickProfit.profitPercent, confidence: match.confidence, isDuplicate: false },
          getBudgetStatus(),
        );

        (entry['stages'] as Record<string, unknown>)['enrichmentGate'] = {
          passed: gateResult,
          profitPercent: quickProfit.profitPercent,
          confidence: match.confidence.composite,
        };

        if (!gateResult) {
          (entry['stages'] as Record<string, unknown>)['outcome'] = 'GATED';
          output.summary.gated++;
          output.listings.push(entry);
          continue;
        }

        // Phase 2: Enrichment (optional, costs 1 API call each)
        if (!enrichEnabled) {
          (entry['stages'] as Record<string, unknown>)['outcome'] = 'ENRICH_SKIPPED (enrich=false)';
          output.listings.push(entry);
          continue;
        }

        if (!canMakeCall()) {
          (entry['stages'] as Record<string, unknown>)['outcome'] = 'BUDGET_EXHAUSTED';
          output.listings.push(entry);
          continue;
        }

        const enriched = await getItem(listing.itemId);
        output.summary.enriched++;

        (entry['stages'] as Record<string, unknown>)['enrichment'] = {
          hasLocalizedAspects: !!enriched?.localizedAspects?.length,
          hasConditionDescriptors: !!enriched?.conditionDescriptors?.length,
          localizedAspects: enriched?.localizedAspects ?? null,
          conditionDescriptors: enriched?.conditionDescriptors ?? null,
        };

        if (!enriched) {
          (entry['stages'] as Record<string, unknown>)['outcome'] = 'ENRICH_FAILED';
          output.listings.push(entry);
          continue;
        }

        // Re-extract with enriched data
        const enrichedExtraction = extractSignals({
          itemId: listing.itemId,
          title: listing.title,
          conditionDescriptors: toExtractionDescriptors(enriched.conditionDescriptors),
          localizedAspects: enriched.localizedAspects ?? null,
        });

        if (enrichedExtraction.rejected) {
          (entry['stages'] as Record<string, unknown>)['outcome'] = 'REJECTED_JUNK_PHASE2';
          output.summary.junk++;
          output.listings.push(entry);
          continue;
        }

        const enrichedSignals = enrichedExtraction.listing!;

        (entry['stages'] as Record<string, unknown>)['enrichedExtraction'] = {
          cardName: enrichedSignals.cardName,
          cardNumber: enrichedSignals.cardNumber,
          variant: enrichedSignals.variant,
          setName: enrichedSignals.setName,
          condition: enrichedSignals.condition,
          signalSources: enrichedSignals.signalSources,
        };

        // Re-match
        const enrichedMatch = await matchListing(enrichedSignals);

        (entry['stages'] as Record<string, unknown>)['enrichedMatching'] = enrichedMatch
          ? {
              card: enrichedMatch.card,
              variant: { id: enrichedMatch.variant.id, name: enrichedMatch.variant.name },
              confidence: enrichedMatch.confidence,
              strategy: enrichedMatch.strategy,
              variantMethod: enrichedMatch.variantMethod,
            }
          : null;

        if (!enrichedMatch) {
          (entry['stages'] as Record<string, unknown>)['outcome'] = 'NO_MATCH_PHASE2';
          output.summary.noMatch++;
          output.listings.push(entry);
          continue;
        }

        // Real profit
        const realCondition = enrichedSignals.condition?.condition || titleCondition;
        const realProfit = calculateProfit({
          ebayPriceGBP,
          shippingGBP: ebayShippingGBP,
          condition: realCondition,
          variantPrices: enrichedMatch.variant.prices,
          exchangeRate,
        });

        (entry['stages'] as Record<string, unknown>)['realProfit'] = realProfit
          ? {
              condition: realCondition,
              totalCostGBP: realProfit.totalCostGBP,
              marketValueUSD: realProfit.marketValueUSD,
              marketValueGBP: realProfit.marketValueGBP,
              profitGBP: realProfit.profitGBP,
              profitPercent: realProfit.profitPercent,
            }
          : null;

        if (!realProfit || realProfit.profitPercent < 5) {
          (entry['stages'] as Record<string, unknown>)['outcome'] = 'UNPROFITABLE';
          output.listings.push(entry);
          continue;
        }

        // Confidence gate
        if (enrichedMatch.confidence.composite < 0.65) {
          (entry['stages'] as Record<string, unknown>)['outcome'] = 'LOW_CONFIDENCE';
          output.listings.push(entry);
          continue;
        }

        // Tier classification
        const tier = classifyTier(realProfit.profitPercent, enrichedMatch.confidence.composite, 'unknown');

        (entry['stages'] as Record<string, unknown>)['tier'] = tier;
        (entry['stages'] as Record<string, unknown>)['outcome'] = `DEAL_CANDIDATE (${tier})`;
        output.summary.deals++;

        // NOTE: We do NOT call createDeal here — this is a debug endpoint.
        // The real scan loop handles actual deal creation.
      } catch (err) {
        (entry['stages'] as Record<string, unknown>)['outcome'] = 'ERROR';
        (entry['stages'] as Record<string, unknown>)['error'] = err instanceof Error ? err.message : String(err);
        output.summary.errors++;
        log.error({ err, itemId: listing.itemId }, 'Error in debug scan');
      }

      output.listings.push(entry);
    }

    output.timing = `${Date.now() - startTime}ms`;
    output.budget = getBudgetStatus();
    res.json(output);
  } catch (err) {
    output.timing = `${Date.now() - startTime}ms`;
    res.status(500).json({
      ...output,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export { debugScanRouter };
