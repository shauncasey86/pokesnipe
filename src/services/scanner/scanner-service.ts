import pino from 'pino';
import { isDuplicate, markProcessed } from './deduplicator.js';
import { shouldEnrich } from './enrichment-gate.js';
import { classifyTier } from './tier-classifier.js';
import { createDeal } from './deal-creator.js';

// Stage 5 — eBay client & budget
import { searchItems, getItem, canMakeCall, getBudgetStatus } from '../ebay/index.js';
import type { EbayItemSummary, EbayItemDetail } from '../ebay/index.js';

// Stage 6 — Signal extraction
import { extractSignals } from '../extraction/index.js';

// Stage 7 — Matching engine
import { matchListing } from '../matching/index.js';

// Stage 4 — Pricing & exchange rate
import { calculateProfit } from '../pricing/pricing-engine.js';
import { getValidRate } from '../exchange-rate/exchange-rate-service.js';

const log = pino({ name: 'scanner' });

export interface ScanResult {
  dealsCreated: number;
  listingsProcessed: number;
  enrichmentCalls: number;
  skippedDuplicate: number;
  skippedJunk: number;
  skippedNoMatch: number;
  skippedGate: number;
  errors: number;
}

/**
 * Transform eBay conditionDescriptors from API format to extraction format.
 * eBay returns values as { content: string }[], extraction expects string[].
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
 * Build the extraction input from an eBay listing summary (Phase 1)
 * or enriched detail (Phase 2).
 */
function toExtractionInput(
  summary: EbayItemSummary,
  detail?: EbayItemDetail | null,
) {
  return {
    itemId: summary.itemId,
    title: summary.title,
    conditionDescriptors: toExtractionDescriptors(detail?.conditionDescriptors),
    localizedAspects: detail?.localizedAspects ?? null,
  };
}

/**
 * Run a single scan cycle.
 *
 * 1. Search eBay for Pokemon card listings (1 API call, up to 200 results)
 * 2. For each listing:
 *    a. Dedup check
 *    b. Extract signals from title (Phase 1)
 *    c. Match against card database
 *    d. Quick profit estimate (title-parsed condition or default LP)
 *    e. Enrichment gate — should we spend a getItem() call?
 *    f. If yes: getItem() → re-extract → re-match → real profit → create deal
 */
export async function runScanCycle(): Promise<ScanResult> {
  const stats: ScanResult = {
    dealsCreated: 0,
    listingsProcessed: 0,
    enrichmentCalls: 0,
    skippedDuplicate: 0,
    skippedJunk: 0,
    skippedNoMatch: 0,
    skippedGate: 0,
    errors: 0,
  };

  // Step 1: Check budget
  if (!canMakeCall()) {
    log.warn('Budget exhausted, skipping scan cycle');
    return stats;
  }

  // Step 2: Search eBay — PHASE 1
  // searchItems already applies: FIXED_PRICE, min £10, condition IDs, GB delivery
  let listings;
  try {
    listings = await searchItems('pokemon card', 200);
  } catch (err) {
    log.error({ err }, 'eBay search failed');
    stats.errors++;
    return stats;
  }

  if (!listings?.itemSummaries?.length) {
    log.info('No listings returned from eBay search');
    return stats;
  }

  log.info({ count: listings.itemSummaries.length }, 'Processing listings from eBay');

  // Step 3: Process each listing
  for (const listing of listings.itemSummaries) {
    stats.listingsProcessed++;

    try {
      // 3a. Dedup check
      if (await isDuplicate(listing.itemId)) {
        stats.skippedDuplicate++;
        continue;
      }
      markProcessed(listing.itemId);

      // 3b. Extract signals from title (Phase 1 — title only, no enrichment data)
      const extractionResult = extractSignals(toExtractionInput(listing));
      if (extractionResult.rejected) {
        stats.skippedJunk++;
        continue;
      }
      const signals = extractionResult.listing!;

      // 3c. Match against card database
      const match = await matchListing(signals);
      if (!match) {
        stats.skippedNoMatch++;
        continue;
      }

      // 3d. Quick profit estimate (title-parsed condition or default LP)
      const ebayPriceGBP = parseFloat(listing.price?.value || '0');
      const ebayShippingGBP = parseFloat(
        listing.shippingOptions?.[0]?.shippingCost?.value || '0',
      );
      const titleCondition = signals.condition?.condition || 'LP';

      let exchangeRate: number;
      try {
        exchangeRate = await getValidRate();
      } catch (err) {
        log.warn({ err }, 'Exchange rate unavailable, skipping cycle');
        stats.errors++;
        break; // can't price anything without exchange rate
      }

      const quickProfit = calculateProfit({
        ebayPriceGBP,
        shippingGBP: ebayShippingGBP,
        condition: titleCondition,
        variantPrices: match.variant.prices,
        exchangeRate,
      });

      if (!quickProfit) {
        stats.skippedNoMatch++;
        continue;
      }

      // 3e. Enrichment gate — should we spend a getItem() call?
      if (
        !shouldEnrich(
          {
            titleOnlyProfitPercent: quickProfit.profitPercent,
            confidence: match.confidence,
            isDuplicate: false,
          },
          getBudgetStatus(),
        )
      ) {
        stats.skippedGate++;
        continue;
      }

      // 3f. PHASE 2 — Enrichment: call getItem() for full listing data
      if (!canMakeCall()) {
        log.warn('Budget exhausted mid-cycle, stopping enrichment');
        break;
      }

      let enriched: EbayItemDetail | null;
      try {
        enriched = await getItem(listing.itemId);
        stats.enrichmentCalls++;
      } catch (err) {
        log.warn({ err, itemId: listing.itemId }, 'getItem failed, skipping');
        stats.errors++;
        continue;
      }

      if (!enriched) {
        // getItem returned null (budget exhausted inside client)
        log.warn('getItem returned null (budget), stopping enrichment');
        break;
      }

      // Re-extract signals with enriched data (conditionDescriptors, localizedAspects)
      const enrichedExtractionResult = extractSignals(
        toExtractionInput(listing, enriched),
      );
      if (enrichedExtractionResult.rejected) {
        stats.skippedJunk++;
        continue;
      }
      const enrichedSignals = enrichedExtractionResult.listing!;

      // Re-match with enriched signals
      const enrichedMatch = await matchListing(enrichedSignals);
      if (!enrichedMatch) {
        stats.skippedNoMatch++;
        continue;
      }

      // Recalculate profit with real condition from enrichment
      const realCondition = enrichedSignals.condition?.condition || titleCondition;
      const realProfit = calculateProfit({
        ebayPriceGBP,
        shippingGBP: ebayShippingGBP,
        condition: realCondition,
        variantPrices: enrichedMatch.variant.prices,
        exchangeRate,
      });

      if (!realProfit) continue;

      // Skip if not profitable after enrichment
      if (realProfit.profitPercent < 5) continue;

      // 3g. Classify tier and create deal
      const tier = classifyTier(
        realProfit.profitPercent,
        enrichedMatch.confidence.composite,
        'unknown', // liquidity — placeholder until Stage 9
      );

      const confidenceTier =
        enrichedMatch.confidence.composite >= 0.85
          ? 'high'
          : enrichedMatch.confidence.composite >= 0.65
            ? 'medium'
            : 'low';

      const deal = await createDeal({
        ebayItemId: listing.itemId,
        ebayTitle: listing.title,
        ebayPriceGBP,
        ebayShippingGBP,
        ebayImageUrl:
          listing.image?.imageUrl || undefined,
        ebayUrl: listing.itemWebUrl,
        sellerName: listing.seller?.username,
        sellerFeedback: listing.seller?.feedbackScore,
        listedAt: listing.itemCreationDate,
        cardId: enrichedMatch.card.scrydexCardId,
        variantId: enrichedMatch.variant.id,
        buyerProtFee: realProfit.buyerProtectionFee,
        totalCostGBP: realProfit.totalCostGBP,
        marketPriceUSD: realProfit.marketValueUSD,
        marketPriceGBP: realProfit.marketValueGBP,
        exchangeRate,
        profitGBP: realProfit.profitGBP,
        profitPercent: realProfit.profitPercent,
        tier,
        confidence: enrichedMatch.confidence.composite,
        confidenceTier,
        condition: realCondition,
        conditionSource: enrichedSignals.condition?.source || 'default',
        isGraded: enrichedSignals.condition?.isGraded || false,
        gradingCompany: enrichedSignals.condition?.gradingCompany || undefined,
        grade: enrichedSignals.condition?.grade || undefined,
        matchSignals: {
          extraction: enrichedSignals,
          confidence: enrichedMatch.confidence,
          phaseOneProfit: quickProfit,
          phaseTwoProfit: realProfit,
          enrichmentUsed: true,
        },
      });

      if (deal) {
        stats.dealsCreated++;
        log.info(
          {
            dealId: deal.dealId,
            tier,
            profit: deal.profitGBP,
            confidence: enrichedMatch.confidence.composite,
          },
          'New deal found',
        );
      }
    } catch (err) {
      log.error({ err, itemId: listing.itemId }, 'Error processing listing');
      stats.errors++;
    }
  }

  return stats;
}
