import pino from 'pino';
import { isDuplicate, markProcessed } from './deduplicator.js';
import { shouldEnrich } from './enrichment-gate.js';
import { classifyTier } from './tier-classifier.js';
import { createDeal } from './deal-creator.js';

// Stage 5 — eBay client & budget
import { searchItems, getItem, canMakeCall, getBudgetStatus } from '../ebay/index.js';
import type { EbayItemSummary, EbayItemDetail } from '../ebay/index.js';

// Stage 6 — Signal extraction
import { extractSignals, detectDescriptionJunk } from '../extraction/index.js';

// Stage 7 — Matching engine
import { matchListing } from '../matching/index.js';

// Stage 4 — Pricing & exchange rate
import { calculateProfit } from '../pricing/pricing-engine.js';
import { getValidRate } from '../exchange-rate/exchange-rate-service.js';

// Stage 9 — Liquidity engine
import { calculateLiquidity, getVelocity, adjustTierForLiquidity } from '../liquidity/index.js';

// Learned junk scorer (soft confidence penalty from user reports)
import { scoreJunkSignals } from '../extraction/junk-scorer.js';

// Stage 13 — Observability
import { createPipelineContext } from '../logger/correlation.js';
import { sendDealAlert } from '../notifications/deal-alerts.js';

const log = pino({ name: 'scanner' });

type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'DM';

/**
 * Build a condition comps snapshot for all conditions (not just the matched one).
 * Converts USD prices to GBP for the deal record.
 * Includes graded prices when available.
 */
function buildConditionComps(
  prices: Partial<Record<Condition, { low: number; market: number }>>,
  exchangeRate: number,
  gradedPrices?: Record<string, { low: number; market: number; mid?: number; high?: number }> | null,
): Record<string, unknown> {
  const comps: Record<string, unknown> = {};
  for (const condition of ['NM', 'LP', 'MP', 'HP', 'DM'] as Condition[]) {
    const price = prices[condition];
    if (price) {
      comps[condition] = {
        lowUSD: price.low,
        marketUSD: price.market,
        lowGBP: Math.round(price.low * exchangeRate * 100) / 100,
        marketGBP: Math.round(price.market * exchangeRate * 100) / 100,
      };
    }
  }
  // Include graded prices (e.g., PSA_10, CGC_9.5)
  if (gradedPrices) {
    for (const [key, price] of Object.entries(gradedPrices)) {
      if (price?.market != null) {
        comps[key] = {
          lowUSD: price.low,
          marketUSD: price.market,
          lowGBP: Math.round(price.low * exchangeRate * 100) / 100,
          marketGBP: Math.round(price.market * exchangeRate * 100) / 100,
          ...(price.mid != null ? { midUSD: price.mid, midGBP: Math.round(price.mid * exchangeRate * 100) / 100 } : {}),
          ...(price.high != null ? { highUSD: price.high, highGBP: Math.round(price.high * exchangeRate * 100) / 100 } : {}),
        };
      }
    }
  }
  return comps;
}

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
 * eBay returns values as { content: string; additionalInfo?: string[] }[],
 * extraction expects string[]. AdditionalInfo is captured alongside content.
 */
function toExtractionDescriptors(
  descriptors?: EbayItemDetail['conditionDescriptors'],
): Array<{ name: string; values: string[]; additionalInfo?: string[] }> | undefined {
  if (!descriptors?.length) return undefined;
  return descriptors.map((d) => {
    const additionalInfo: string[] = [];
    for (const v of d.values) {
      if (v.additionalInfo?.length) {
        additionalInfo.push(...v.additionalInfo);
      }
    }
    return {
      name: d.name,
      values: d.values.map((v) => v.content),
      ...(additionalInfo.length > 0 ? { additionalInfo } : {}),
    };
  });
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
    conditionText: detail?.condition ?? summary.condition ?? null,
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

  // Track concurrent supply: how many listings match the same card in this batch
  const cardSupplyMap = new Map<string, number>();

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

      // Correlation context for tracing this listing through the pipeline
      const ctx = createPipelineContext(listing.itemId);
      log.debug({ ...ctx }, 'Processing listing');

      // 3b. Extract signals from title (Phase 1 — title only, no enrichment data)
      const extractionResult = extractSignals(toExtractionInput(listing));
      if (extractionResult.rejected) {
        log.debug({ ...ctx, rejected: true, reason: extractionResult.reason }, 'Signals extracted — rejected');
        stats.skippedJunk++;
        continue;
      }
      const signals = extractionResult.listing!;

      // 3c. Match against card database
      const match = await matchListing(signals);
      if (!match) {
        log.debug({ ...ctx, matched: false }, 'Match result — no match');
        stats.skippedNoMatch++;
        continue;
      }
      log.debug({ ...ctx, matched: true, confidence: match.confidence.composite }, 'Match result');

      // Track concurrent supply for liquidity scoring
      const matchedCardId = match.card.scrydexCardId;
      cardSupplyMap.set(matchedCardId, (cardSupplyMap.get(matchedCardId) || 0) + 1);

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
        isGraded: signals.condition?.isGraded || false,
        gradingCompany: signals.condition?.gradingCompany ?? undefined,
        grade: signals.condition?.grade ?? undefined,
        gradedPrices: match.variant.gradedPrices,
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
        log.warn({ err, ...ctx }, 'getItem failed, skipping');
        stats.errors++;
        continue;
      }

      if (!enriched) {
        // getItem returned null (budget exhausted inside client)
        log.warn({ ...ctx }, 'getItem returned null (budget), stopping enrichment');
        break;
      }

      log.debug({ ...ctx, enriched: true }, 'Enriched listing');

      // Check description for fake/fan-art signals
      const descJunk = detectDescriptionJunk(enriched.description, enriched.shortDescription);
      if (descJunk.isJunk) {
        log.debug({ ...ctx, rejected: true, reason: descJunk.reason }, 'Description junk detected');
        stats.skippedJunk++;
        continue;
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
      const realIsGraded = enrichedSignals.condition?.isGraded || false;
      const realGradingCompany = enrichedSignals.condition?.gradingCompany ?? undefined;
      const realGrade = enrichedSignals.condition?.grade ?? undefined;
      const realProfit = calculateProfit({
        ebayPriceGBP,
        shippingGBP: ebayShippingGBP,
        condition: realCondition,
        variantPrices: enrichedMatch.variant.prices,
        exchangeRate,
        isGraded: realIsGraded,
        gradingCompany: realGradingCompany,
        grade: realGrade,
        gradedPrices: enrichedMatch.variant.gradedPrices,
      });

      if (!realProfit) continue;

      // Skip if not profitable after enrichment
      if (realProfit.profitPercent < 5) continue;

      // Apply learned junk signals as a soft confidence penalty.
      // This runs BEFORE the confidence gate so borderline junk listings
      // get pushed below 0.65, but strong matches survive.
      const junkScore = await scoreJunkSignals(
        enrichedSignals.cleanedTitle ?? listing.title.toLowerCase(),
        listing.seller?.username ?? null,
      );
      const adjustedConfidence = Math.max(0, enrichedMatch.confidence.composite - junkScore.penalty);

      if (junkScore.penalty > 0) {
        log.debug({
          ...ctx,
          originalConfidence: enrichedMatch.confidence.composite,
          adjustedConfidence,
          junkPenalty: junkScore.penalty,
          matchedKeywords: junkScore.matchedKeywords,
          sellerReports: junkScore.sellerReportCount,
        }, 'Applied learned junk penalty');
      }

      // Confidence gate: spec requires >= 0.65 to create a deal
      if (adjustedConfidence < 0.65) continue;

      // 3g. Classify base tier
      const baseTier = classifyTier(
        realProfit.profitPercent,
        adjustedConfidence,
        'unknown',
      );

      // 3h. Calculate liquidity (Tier 1 + 2 — always free)
      const concurrentSupply = cardSupplyMap.get(enrichedMatch.card.scrydexCardId) || 0;
      const quantitySold = enriched.quantitySold || listing.quantitySold || 0;

      let liquidity = calculateLiquidity(
        enrichedMatch.variant,
        realCondition,
        { concurrentSupply, quantitySold },
        null, // velocity data — fetched conditionally below
      );

      // For high-profit deals (>40%), auto-fetch Tier 3 velocity (3 Scrydex credits)
      let velocityData = null;
      if (realProfit.profitPercent > 40) {
        velocityData = await getVelocity(
          enrichedMatch.card.scrydexCardId,
          enrichedMatch.variant.name || 'default',
        );
        // Recalculate liquidity with velocity data
        liquidity = calculateLiquidity(
          enrichedMatch.variant,
          realCondition,
          { concurrentSupply, quantitySold },
          velocityData,
        );
      }

      // Apply tier adjustment based on liquidity
      const tier = adjustTierForLiquidity(baseTier, liquidity.grade);

      const confidenceTier =
        adjustedConfidence >= 0.85
          ? 'high'
          : adjustedConfidence >= 0.65
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
        confidence: adjustedConfidence,
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
          liquidity: {
            composite: liquidity.composite,
            grade: liquidity.grade,
            signals: liquidity.signals,
            velocityFetched: velocityData?.fetched || false,
          },
          ...(junkScore.penalty > 0 ? {
            junkPenalty: {
              penalty: junkScore.penalty,
              matchedKeywords: junkScore.matchedKeywords,
              sellerReportCount: junkScore.sellerReportCount,
              adjustedConfidence,
            },
          } : {}),
        },
        conditionComps: buildConditionComps(enrichedMatch.variant.prices, exchangeRate, enrichedMatch.variant.gradedPrices),
        liquidityScore: liquidity.composite,
        liquidityGrade: liquidity.grade,
      });

      if (deal) {
        stats.dealsCreated++;
        log.info(
          {
            ...ctx,
            dealId: deal.dealId,
            tier,
            profit: deal.profitGBP,
            confidence: adjustedConfidence,
            liquidityGrade: liquidity.grade,
            liquidityScore: liquidity.composite,
          },
          'Deal created',
        );

        // Fire and forget — don't block the scanner on Telegram
        sendDealAlert({
          cardName: enrichedMatch.card.name || listing.title,
          cardNumber: enrichedMatch.card.number,
          ebayPriceGBP,
          marketPriceGBP: realProfit.marketValueGBP,
          profitGBP: realProfit.profitGBP,
          profitPercent: realProfit.profitPercent,
          tier,
          condition: realCondition,
          confidence: adjustedConfidence,
          ebayUrl: listing.itemWebUrl,
        }).catch(err => log.warn({ err, ...ctx }, 'Deal alert failed'));
      }
    } catch (err) {
      log.error({ err, itemId: listing.itemId, service: 'scanner' }, 'Error processing listing');
      stats.errors++;
    }
  }

  return stats;
}
