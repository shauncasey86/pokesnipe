// src/services/arbitrage/arbitrage-engine.ts
// ═══════════════════════════════════════════════════════════════════════════
// Arbitrage Engine - Processes eBay listings and calculates arbitrage
// ═══════════════════════════════════════════════════════════════════════════

import { EbayListing } from '../ebay/types.js';
import { ScrydexCard, ScrydexPrice } from '../scrydex/types.js';
import { scrydex } from '../scrydex/client.js';
import { expansionService } from '../expansion/index.js';
import { exchangeRate } from '../currency/exchange-rate.js';
import { titleParser } from '../parser/index.js';
import type { ParsedTitle } from '../parser/types.js';
import type { Deal, CardDetails, ArbitrageThresholds } from './types.js';
import { dealStore } from './deal-store.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { ScrydexCondition } from '../ebay/condition-mapper.js';
import { corpusService } from '../training/index.js';
import { getPool } from '../database/postgres.js';

// ─────────────────────────────────────────────────────────────────────────────
// EPN Affiliate URL Generator (inline)
// ─────────────────────────────────────────────────────────────────────────────

const EPN_CAMPAIGN_ID = process.env.EPN_CAMPAIGN_ID || '';

function generateAffiliateUrl(ebayUrl: string): string {
  if (!EPN_CAMPAIGN_ID) return ebayUrl;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // EPN NEW FORMAT (Feb 2021+) - Rover links are deprecated!
  // Format: [TARGET_URL]?mkevt=1&mkcid=1&mkrid=[ROTATION-ID]&campid=[CAMPAIGN-ID]&toolid=10001
  // ═══════════════════════════════════════════════════════════════════════════
  
  // UK Rotation ID: 710-53481-19255-0
  const rotationId = '710-53481-19255-0';
  
  // Parse the URL to add parameters correctly
  try {
    const url = new URL(ebayUrl);
    
    // Add EPN tracking parameters
    url.searchParams.set('mkevt', '1');           // Event tracking enabled
    url.searchParams.set('mkcid', '1');           // Campaign type (1 = EPN)
    url.searchParams.set('mkrid', rotationId);    // UK rotation ID
    url.searchParams.set('campid', EPN_CAMPAIGN_ID); // Your campaign ID
    url.searchParams.set('toolid', '10001');      // Tool ID
    
    return url.toString();
  } catch {
    // Fallback: append parameters manually if URL parsing fails
    const separator = ebayUrl.includes('?') ? '&' : '?';
    return `${ebayUrl}${separator}mkevt=1&mkcid=1&mkrid=${rotationId}&campid=${EPN_CAMPAIGN_ID}&toolid=10001`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ProcessResult {
  success: boolean;
  deal?: Deal;
  reason?: string;
  /** Whether the card was successfully matched in Scrydex (even if no deal) */
  matched?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scan Diagnostics - Tracks where matches fail in the pipeline
// ─────────────────────────────────────────────────────────────────────────────

interface ScanDiagnostics {
  totalScanned: number;
  stage1_alreadyProcessed: number;
  stage2_internationalSeller: number;
  stage3_nonEnglish: number;
  stage4_lowConfidence: number;
  stage5_noExpansionMatch: number;
  stage6_noCardNumber: number;
  stage7_printedTotalMismatch: number;
  stage8_scrydexNotFound: number;
  stage9_nameMismatch: number;
  stage10_noPriceMatch: number;
  stage11_belowProfit: number;
  stage12_belowThreshold: number;
  successfulMatches: number;
  successfulDeals: number;
}

const createEmptyDiagnostics = (): ScanDiagnostics => ({
  totalScanned: 0,
  stage1_alreadyProcessed: 0,
  stage2_internationalSeller: 0,
  stage3_nonEnglish: 0,
  stage4_lowConfidence: 0,
  stage5_noExpansionMatch: 0,
  stage6_noCardNumber: 0,
  stage7_printedTotalMismatch: 0,
  stage8_scrydexNotFound: 0,
  stage9_nameMismatch: 0,
  stage10_noPriceMatch: 0,
  stage11_belowProfit: 0,
  stage12_belowThreshold: 0,
  successfulMatches: 0,
  successfulDeals: 0,
});

interface VariantPrices {
  variantName: string;
  prices: ScrydexPrice[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Arbitrage Engine Class
// ─────────────────────────────────────────────────────────────────────────────

class ArbitrageEngine {
  private thresholds: ArbitrageThresholds = {
    premium: { minDiscount: 10, minValue: 1000 },
    high: { minDiscount: 15, minValue: 500 },
    standard: { minDiscount: 20, minValue: 0 },
  };

  // User preference filters
  private ungradedConditions: string[] = ['NM', 'LP', 'MP']; // Default allowed conditions
  private minProfitGBP: number = 5; // Default minimum profit
  private preferredGradingCompanies: string[] = ['PSA', 'CGC', 'BGS'];
  private minGrade: number = 1;
  private maxGrade: number = 10;
  private lastPreferencesLoad: number = 0;
  private readonly PREFERENCES_CACHE_MS = 60000; // Reload preferences every 60 seconds

  private processedListings: Set<string> = new Set();
  private processedListingsTimestamps: Map<string, number> = new Map();

  // ═══════════════════════════════════════════════════════════════════════════
  // SCAN DIAGNOSTICS - Track where matches fail in the pipeline
  // ═══════════════════════════════════════════════════════════════════════════
  private currentScanDiagnostics: ScanDiagnostics = createEmptyDiagnostics();
  private lastCompletedDiagnostics: ScanDiagnostics | null = null;
  private sessionDiagnostics: ScanDiagnostics = createEmptyDiagnostics(); // Cumulative across all scans
  private sessionScanCount: number = 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // SAFEGUARD: Query Deduplication Caches
  // ═══════════════════════════════════════════════════════════════════════════

  // Track card signatures we've already queried this session (expansion:number)
  // Now includes full card data to avoid repeat API calls
  private queriedCards: Map<string, { found: boolean; cardId?: string; cardData?: ScrydexCard }> = new Map();

  // Track failed queries to avoid repeating them
  private failedQueries: Map<string, number> = new Map(); // query -> timestamp

  // Failed query cache TTL (15 minutes - reduced from 1 hour for faster retries)
  private static readonly FAILED_QUERY_TTL_MS = 15 * 60 * 1000;

  // Processed listings TTL (24 hours - allow re-scanning after a day)
  private static readonly PROCESSED_LISTINGS_TTL_MS = 24 * 60 * 60 * 1000;

  // Max cache sizes to prevent unbounded growth
  private static readonly MAX_PROCESSED_LISTINGS = 10000;
  private static readonly MAX_QUERIED_CARDS = 5000;

  // Pre-compiled regex patterns for performance
  private static readonly PROMO_PREFIX_REGEX = /^(SVP|SWSH|SM|XY|BW|DP|HGSS|MEP)(\d+)$/i;

  // Auto-pruning timer
  private pruneTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Start auto-pruning every 30 minutes
    this.startAutoPruning();
  }

  private startAutoPruning(): void {
    // Clear any existing timer
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
    }

    // Prune caches every 30 minutes
    this.pruneTimer = setInterval(() => {
      this.pruneAllCaches();
    }, 30 * 60 * 1000);

    logger.debug('CACHE_AUTO_PRUNE_STARTED', { intervalMinutes: 30 });
  }

  private pruneAllCaches(): void {
    const prunedFailed = this.pruneExpiredFailedQueries();
    const prunedProcessed = this.pruneExpiredProcessedListings();
    const prunedQueried = this.pruneOldQueriedCards();

    if (prunedFailed > 0 || prunedProcessed > 0 || prunedQueried > 0) {
      logger.info('CACHES_PRUNED', {
        failedQueries: prunedFailed,
        processedListings: prunedProcessed,
        queriedCards: prunedQueried,
        remaining: {
          processedListings: this.processedListings.size,
          queriedCards: this.queriedCards.size,
          failedQueries: this.failedQueries.size,
        },
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // User Preferences Loading
  // ─────────────────────────────────────────────────────────────────────────────

  private async loadPreferences(): Promise<void> {
    const now = Date.now();

    // Only reload if cache has expired
    if (now - this.lastPreferencesLoad < this.PREFERENCES_CACHE_MS) {
      return;
    }

    try {
      const pool = getPool();
      if (!pool) return;

      const result = await pool.query(`
        SELECT
          ungraded_conditions,
          min_profit_gbp,
          preferred_grading_companies,
          min_grade,
          max_grade,
          tier_premium_value,
          tier_premium_discount,
          tier_high_value,
          tier_high_discount,
          tier_standard_value,
          tier_standard_discount
        FROM user_preferences WHERE id = 1
      `);

      if (result.rows.length > 0) {
        const prefs = result.rows[0];

        // Condition filter
        if (prefs.ungraded_conditions) {
          this.ungradedConditions = prefs.ungraded_conditions;
        }

        // Minimum profit filter
        if (prefs.min_profit_gbp !== null && prefs.min_profit_gbp !== undefined) {
          this.minProfitGBP = parseFloat(prefs.min_profit_gbp);
        }

        // Grading company filter
        if (prefs.preferred_grading_companies) {
          this.preferredGradingCompanies = prefs.preferred_grading_companies;
        }

        // Grade range filter
        if (prefs.min_grade !== null && prefs.min_grade !== undefined) {
          this.minGrade = parseFloat(prefs.min_grade);
        }
        if (prefs.max_grade !== null && prefs.max_grade !== undefined) {
          this.maxGrade = parseFloat(prefs.max_grade);
        }

        // Tier thresholds
        if (prefs.tier_premium_value !== null || prefs.tier_premium_discount !== null) {
          this.thresholds.premium = {
            minValue: prefs.tier_premium_value ?? this.thresholds.premium.minValue,
            minDiscount: prefs.tier_premium_discount ?? this.thresholds.premium.minDiscount,
          };
        }
        if (prefs.tier_high_value !== null || prefs.tier_high_discount !== null) {
          this.thresholds.high = {
            minValue: prefs.tier_high_value ?? this.thresholds.high.minValue,
            minDiscount: prefs.tier_high_discount ?? this.thresholds.high.minDiscount,
          };
        }
        if (prefs.tier_standard_value !== null || prefs.tier_standard_discount !== null) {
          this.thresholds.standard = {
            minValue: prefs.tier_standard_value ?? this.thresholds.standard.minValue,
            minDiscount: prefs.tier_standard_discount ?? this.thresholds.standard.minDiscount,
          };
        }

        logger.debug('ARBITRAGE_PREFERENCES_LOADED', {
          ungradedConditions: this.ungradedConditions,
          minProfitGBP: this.minProfitGBP,
          preferredGradingCompanies: this.preferredGradingCompanies,
          minGrade: this.minGrade,
          maxGrade: this.maxGrade,
          thresholds: this.thresholds,
        });
      }

      this.lastPreferencesLoad = now;
    } catch (error) {
      logger.warn('ARBITRAGE_PREFERENCES_LOAD_ERROR', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  private pruneExpiredProcessedListings(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [itemId, timestamp] of this.processedListingsTimestamps) {
      if (now - timestamp >= ArbitrageEngine.PROCESSED_LISTINGS_TTL_MS) {
        this.processedListings.delete(itemId);
        this.processedListingsTimestamps.delete(itemId);
        pruned++;
      }
    }

    // Also enforce max size
    if (this.processedListings.size > ArbitrageEngine.MAX_PROCESSED_LISTINGS) {
      const excess = this.processedListings.size - ArbitrageEngine.MAX_PROCESSED_LISTINGS;
      const oldestKeys = Array.from(this.processedListingsTimestamps.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, excess)
        .map(([key]) => key);

      for (const key of oldestKeys) {
        this.processedListings.delete(key);
        this.processedListingsTimestamps.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  private pruneOldQueriedCards(): number {
    // Enforce max size by removing oldest entries
    if (this.queriedCards.size <= ArbitrageEngine.MAX_QUERIED_CARDS) {
      return 0;
    }

    const excess = this.queriedCards.size - ArbitrageEngine.MAX_QUERIED_CARDS;
    const keys = Array.from(this.queriedCards.keys()).slice(0, excess);

    for (const key of keys) {
      this.queriedCards.delete(key);
    }

    return excess;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Main Processing
  // ───────────────────────────────────────────────────────────────────────────

  async processListing(listing: EbayListing): Promise<ProcessResult> {
    // Load user preferences (cached, refreshes every 60s)
    await this.loadPreferences();

    // Track total scanned
    this.trackDiagnostic('totalScanned');

    // Skip if already processed
    if (this.processedListings.has(listing.itemId)) {
      this.trackDiagnostic('stage1_alreadyProcessed');
      return { success: false, reason: 'Already processed' };
    }

    // Mark as processed IMMEDIATELY with timestamp for expiration
    this.processedListings.add(listing.itemId);
    this.processedListingsTimestamps.set(listing.itemId, Date.now());

    // 1. Parse the title
    const parsed = titleParser.parse(listing.title);

    // ═══════════════════════════════════════════════════════════════════════════
    // TRAINING: Track every parse for analytics
    // ═══════════════════════════════════════════════════════════════════════════
    corpusService.trackParse(parsed);

    // ═══════════════════════════════════════════════════════════════════════════
    // FULL DEBUG LOG FOR TRAINING - Every listing gets logged
    // ═══════════════════════════════════════════════════════════════════════════
    logger.debug('TITLE_PARSED', {
      itemId: listing.itemId,
      title: listing.title,
      parsed: {
        cardName: parsed.cardName,
        cardNumber: parsed.cardNumber,
        printedNumber: parsed.printedNumber,
        setName: parsed.setName,
        confidence: parsed.confidenceScore,
        language: parsed.language,
        languageCode: parsed.languageCode,
        isGraded: parsed.isGraded,
        gradingCompany: parsed.gradingCompany,
        grade: parsed.grade,
        isFirstEdition: parsed.isFirstEdition,
        isShadowless: parsed.isShadowless,
        variant: parsed.variant,
      },
      listing: {
        price: listing.price,
        shippingCost: listing.shippingCost,
        seller: listing.seller?.username,
        sellerFeedback: listing.seller?.feedbackScore,
        sellerFeedbackPercent: listing.seller?.feedbackPercentage,
        location: listing.location || '',
        country: listing.country || '',
      },
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNATIONAL SELLER FILTER - Skip non-UK sellers
    // Safety net in case eBay API filter is bypassed or returns international results
    // ═══════════════════════════════════════════════════════════════════════════
    const sellerCountry = listing.country?.toUpperCase() || '';
    if (sellerCountry && sellerCountry !== 'GB') {
      logger.debug('LISTING_SKIPPED', {
        itemId: listing.itemId,
        reason: 'International seller',
        country: listing.country,
        location: listing.location,
        title: listing.title.substring(0, 60),
      });
      corpusService.trackSkip('International seller');
      this.trackDiagnostic('stage2_internationalSeller');
      return { success: false, reason: `International seller: ${listing.country}` };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BLOCKED CONDITION FILTER - Skip damaged/creased cards early
    // ═══════════════════════════════════════════════════════════════════════════
    if (listing.conditionBlocked) {
      logger.debug('LISTING_SKIPPED', {
        itemId: listing.itemId,
        reason: 'Blocked condition (damaged/creased)',
        title: listing.title.substring(0, 80),
      });
      corpusService.trackSkip('Blocked condition');
      return { success: false, reason: 'Blocked condition (damaged/creased)' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // JAPANESE FILTER - Skip non-English cards early
    // ═══════════════════════════════════════════════════════════════════════════
    if (parsed.languageCode !== 'EN') {
      logger.debug('LISTING_SKIPPED', {
        itemId: listing.itemId,
        reason: 'Non-English card',
        language: parsed.language,
        languageCode: parsed.languageCode,
        title: listing.title.substring(0, 80),
      });
      corpusService.trackSkip('Non-English card');
      this.trackDiagnostic('stage3_nonEnglish');
      return { success: false, reason: `Non-English card: ${parsed.language}` };
    }
    
    // Lower threshold to 28% with card number, 40% without
    // Card number is a strong signal for Scrydex matching, so confidence can be lower with it
    // This significantly increases eligibility rate while Scrydex fallbacks handle edge cases
    const minConfidence = parsed.cardNumber ? 28 : 40;
    if (parsed.confidenceScore < minConfidence) {
      logger.debug('LISTING_SKIPPED', {
        itemId: listing.itemId,
        reason: 'Low confidence',
        confidence: parsed.confidenceScore,
        minRequired: minConfidence,
        hasCardNumber: !!parsed.cardNumber,
        title: listing.title.substring(0, 80),
        cardName: parsed.cardName,
        cardNumber: parsed.cardNumber,
        setName: parsed.setName,
      });
      corpusService.trackSkip('Low confidence');
      this.trackDiagnostic('stage4_lowConfidence');

      return { success: false, reason: `Low confidence: ${parsed.confidenceScore} (min: ${minConfidence})` };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROMO PREFIX EXTRACTION (including MEP for Mega Evolution promos)
    // ═══════════════════════════════════════════════════════════════════════════
    let promoPrefix: string | undefined;
    
    if (parsed.printedNumber) {
      const promoMatch = parsed.printedNumber.match(ArbitrageEngine.PROMO_PREFIX_REGEX);
      if (promoMatch) {
        promoPrefix = promoMatch[1].toUpperCase();
      }
    }

    // 2. Match expansion
    const expansionMatch = expansionService.match(parsed.setName || '', {
      cardNumber: parsed.cardNumber || undefined,
      promoPrefix,
    });
    
    if (!expansionMatch.success || !expansionMatch.match) {
      // ═══════════════════════════════════════════════════════════════════════
      // FALLBACK: Try to infer expansion from card number denominator
      // Uses Scrydex OR query to search multiple candidate expansions in ONE API call
      // Example: (expansion.id:sv5 OR expansion.id:sv4) number:161
      // ═══════════════════════════════════════════════════════════════════════
      if (parsed.cardNumber && parsed.printedNumber) {
        const denomMatch = parsed.printedNumber.match(/\/(\d+)$/);
        if (denomMatch) {
          const denominator = parseInt(denomMatch[1], 10);
          const candidateExpansionIds = expansionService.inferExpansionsFromDenominator(denominator);
          const validCandidates = candidateExpansionIds
            .filter(id => {
              const exp = expansionService.getExpansion(id);
              return exp && exp.languageCode === 'EN';
            })
            .slice(0, 5); // Limit to 5 expansions in OR query

          if (validCandidates.length > 0) {
            // Build OR query for multiple expansions
            const scrydexIds = validCandidates.map(id => expansionService.getScrydexId(id));
            const orClause = scrydexIds.map(id => `expansion.id:${id}`).join(' OR ');
            const orQuery = `(${orClause}) number:${parsed.cardNumber}`;

            logger.info('DENOMINATOR_OR_QUERY', {
              itemId: listing.itemId,
              denominator,
              query: orQuery,
              candidateCount: validCandidates.length,
              title: listing.title.substring(0, 60),
            });

            try {
              const fallbackResult = await scrydex.searchCards({
                q: orQuery,
                include: 'prices,images',
                pageSize: 10,
              });

              if (fallbackResult.data && fallbackResult.data.length > 0) {
                // Find best match by name similarity
                let bestCard: ScrydexCard | null = null;
                let bestSimilarity = 0;
                let bestExpansionId: string | null = null;

                for (const candidateCard of fallbackResult.data as ScrydexCard[]) {
                  if (parsed.cardName) {
                    const similarity = this.calculateNameSimilarity(parsed.cardName, candidateCard.name);
                    if (similarity > bestSimilarity && similarity >= 0.25) {
                      bestSimilarity = similarity;
                      bestCard = candidateCard;
                      bestExpansionId = candidateCard.expansion?.id || null;
                    }
                  } else {
                    bestCard = candidateCard;
                    bestExpansionId = candidateCard.expansion?.id || null;
                    break;
                  }
                }

                if (bestCard && bestExpansionId) {
                  const fallbackExpansion = expansionService.getExpansion(bestExpansionId);
                  if (fallbackExpansion) {
                    logger.info('DENOMINATOR_OR_QUERY_MATCH', {
                      itemId: listing.itemId,
                      matchedExpansion: bestExpansionId,
                      cardId: bestCard.id,
                      cardName: bestCard.name,
                      nameSimilarity: bestSimilarity.toFixed(2),
                    });

                    corpusService.trackMatch();
                    this.trackDiagnostic('successfulMatches');
                    return this.processMatchedCard(listing, parsed, fallbackExpansion, bestCard, 'denominator_or_query');
                  }
                }
              }
            } catch (fallbackErr) {
              logger.debug('DENOMINATOR_OR_QUERY_ERROR', {
                error: fallbackErr instanceof Error ? fallbackErr.message : 'Unknown',
              });
            }
          }
        }
      }

      // No fallback worked - track the failure
      logger.debug('LISTING_SKIPPED', {
        itemId: listing.itemId,
        reason: 'No expansion match',
        parsedSetName: parsed.setName,
        cardNumber: parsed.cardNumber,
        promoPrefix,
        title: listing.title.substring(0, 80),
      });
      corpusService.trackSkip('No expansion match');
      this.trackDiagnostic('stage5_noExpansionMatch');

      // Track failure details for analysis (fire and forget)
      corpusService.trackSetMatchFailure({
        parsedSetName: parsed.setName || '',
        cardNumber: parsed.cardNumber || undefined,
        promoPrefix: promoPrefix || undefined,
        ebayTitle: listing.title,
        ebayItemId: listing.itemId,
        nearMisses: expansionMatch.alternates?.map(a => ({
          expansionId: a.expansion.id,
          expansionName: a.expansion.name,
          matchScore: a.matchScore,
        })),
      }).catch(() => {}); // Non-blocking

      return { success: false, reason: 'No expansion match' };
    }

    const expansion = expansionMatch.match.expansion;
    
    // Log successful expansion match
    logger.debug('EXPANSION_MATCHED', {
      itemId: listing.itemId,
      parsedSetName: parsed.setName,
      matchedExpansion: expansion.name,
      expansionId: expansion.id,
      matchType: expansionMatch.match.matchType,
      printedTotal: expansion.printedTotal,
      listingPrintedNumber: parsed.printedNumber,
    });

    // Filter for English cards only
    if (expansion.languageCode !== 'EN') {
      logger.debug('LISTING_SKIPPED', {
        itemId: listing.itemId,
        reason: 'Non-English expansion',
        expansionName: expansion.name,
        languageCode: expansion.languageCode,
      });
      corpusService.trackSkip('Non-English expansion');
      return { success: false, reason: 'Non-English expansion skipped' };
    }

    // Check we have a card number
    if (!parsed.cardNumber) {
      logger.debug('LISTING_SKIPPED', {
        itemId: listing.itemId,
        reason: 'No card number found',
        title: listing.title.substring(0, 80),
        parsedName: parsed.cardName,
        parsedSetName: parsed.setName,
      });
      corpusService.trackSkip('No card number');
      this.trackDiagnostic('stage6_noCardNumber');
      return { success: false, reason: 'No card number found' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EARLY VALIDATION: Check printed total BEFORE making Scrydex API call
    // This saves credits when we can detect the expansion mismatch from card number
    // RELAXED: Skip validation for subset cards (TG/GG/SV/RC), secret rares, and SIRs
    // ═══════════════════════════════════════════════════════════════════════════
    if (parsed.printedNumber && expansion.printedTotal) {
      const denomMatch = parsed.printedNumber.match(/\/(\d+)$/);
      if (denomMatch) {
        const listingDenom = parseInt(denomMatch[1], 10);
        const cardNum = parsed.cardNumber || '';

        // Skip validation for subset cards - they have different totals
        const isSubsetCard = /^(TG|GG|SV|RC|H)\d+$/i.test(cardNum);

        // Skip validation for secret rares (card number > base set printed total)
        const numericPart = parseInt(cardNum.replace(/\D/g, ''), 10) || 0;
        const isSecretRare = numericPart > expansion.printedTotal;

        // Skip validation for high card numbers (likely SIR/SAR in modern sets)
        // Modern SV sets have SIRs starting around 150-200+
        const isLikelySpecialRare = numericPart > 150;

        // Skip validation if denominator suggests a different modern set
        // This allows fallback to try multiple expansions
        const isHighDenom = listingDenom > 180;

        // Very relaxed validation: ±25 tolerance to handle set variations
        // Only apply when not a subset card, secret rare, or high card number
        const shouldSkipValidation = isSubsetCard || isSecretRare || isLikelySpecialRare || isHighDenom;
        if (!shouldSkipValidation && Math.abs(listingDenom - expansion.printedTotal) > 25) {
          logger.warn('EARLY_PRINTED_TOTAL_MISMATCH', {
            itemId: listing.itemId,
            title: listing.title.substring(0, 80),
            parsedSetName: parsed.setName,
            listingDenominator: listingDenom,
            expansionId: expansion.id,
            expansionName: expansion.name,
            expansionPrintedTotal: expansion.printedTotal,
            reason: 'Card number denominator does not match expansion - skipping Scrydex query to save credits',
          });
          corpusService.trackSkip('Printed total mismatch');
          this.trackDiagnostic('stage7_printedTotalMismatch');
          return { success: false, reason: `Printed total mismatch: /${listingDenom} vs ${expansion.name} (${expansion.printedTotal} cards)` };
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SCRYDEX QUERY - For promos, use full promo number (SWSH144, not 144)
    // For TG/GG/SV cards, try both prefixed and numeric-only formats
    // ═══════════════════════════════════════════════════════════════════════════
    let cardNumber: string;
    let alternateCardNumber: string | null = null;

    // If this is a promo card with a prefix, use the full printed number
    if (promoPrefix && parsed.printedNumber) {
      cardNumber = parsed.printedNumber.toUpperCase();
    } else {
      // Regular cards: strip leading zeros
      cardNumber = (parsed.cardNumber || '').replace(/^0+/, '') || parsed.cardNumber || '';

      // Check for TG/GG/SV prefixes - prepare alternate query without prefix
      const subsetMatch = cardNumber.match(/^(TG|GG|SV)(\d+)$/i);
      if (subsetMatch) {
        // Primary: try with prefix (e.g., "TG15")
        // Alternate: try just the number (e.g., "15")
        alternateCardNumber = subsetMatch[2].replace(/^0+/, '') || subsetMatch[2];
        logger.debug('SUBSET_NUMBER_DETECTED', {
          original: cardNumber,
          prefix: subsetMatch[1].toUpperCase(),
          numericOnly: alternateCardNumber,
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SAFEGUARD: Check if we've already queried this card signature
    // ═══════════════════════════════════════════════════════════════════════════
    const cardSignature = `${expansion.id}:${cardNumber}`;
    const previousQuery = this.queriedCards.get(cardSignature);

    if (previousQuery) {
      if (!previousQuery.found) {
        // We already know this card doesn't exist in Scrydex - skip entirely
        return { success: false, reason: 'Card previously not found (cached)' };
      }

      // Card exists and we have cached data - use it without API call
      if (previousQuery.cardData) {
        logger.debug('CARD_CACHE_HIT', {
          cardSignature,
          cardId: previousQuery.cardId,
          message: 'Using cached card data, no API call'
        });
        // Track successful Scrydex match (even for cached hits - this IS a successful match)
        corpusService.trackMatch();
        this.trackDiagnostic('successfulMatches');
        return this.processMatchedCard(listing, parsed, expansion, previousQuery.cardData, expansionMatch.match.matchType);
      }
    }

    // Check if this exact query previously failed (with TTL)
    const failedAt = this.failedQueries.get(cardSignature);
    if (failedAt && Date.now() - failedAt < ArbitrageEngine.FAILED_QUERY_TTL_MS) {
      return { success: false, reason: 'Query recently failed (cached)' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRY PRIMARY QUERY (with TG/GG/SV prefix if present)
    // For subset cards, use the subset expansion ID instead of main set ID
    // e.g., "Hidden Fates" + "SV65" → use "sm115sv" (Shiny Vault) not "sm115"
    // ═══════════════════════════════════════════════════════════════════════════

    // Check if this is a subset card and get the correct expansion ID
    let queryExpansionId = expansion.id;
    const subsetPrefix = expansionService.getSubsetPrefix(cardNumber);
    if (subsetPrefix) {
      queryExpansionId = expansionService.getSubsetExpansionId(expansion.id, subsetPrefix);
      if (queryExpansionId !== expansion.id) {
        logger.info('USING_SUBSET_EXPANSION', {
          mainSet: expansion.name,
          mainSetId: expansion.id,
          subsetPrefix,
          subsetExpansionId: queryExpansionId,
          cardNumber,
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MAP LOCAL ID TO SCRYDEX ID
    // Our local expansion IDs may not match Scrydex's IDs exactly
    // Use the validated Scrydex ID for the query
    // ═══════════════════════════════════════════════════════════════════════════
    const scrydexExpansionId = expansionService.getScrydexId(queryExpansionId);
    if (scrydexExpansionId !== queryExpansionId) {
      logger.debug('EXPANSION_ID_MAPPED', {
        localId: queryExpansionId,
        scrydexId: scrydexExpansionId,
        expansion: expansion.name,
      });
    }

    const query = `expansion.id:${scrydexExpansionId} number:${cardNumber}`;

    logger.info('SCRYDEX_QUERY', {
      title: listing.title.substring(0, 50),
      expansion: scrydexExpansionId,
      localExpansion: scrydexExpansionId !== queryExpansionId ? queryExpansionId : undefined,
      mainExpansion: expansion.id !== queryExpansionId ? expansion.id : undefined,
      cardNumber,
      query,
      isPromo: !!promoPrefix,
      hasAlternate: !!alternateCardNumber,
      isSubset: subsetPrefix !== null,
      idMapped: scrydexExpansionId !== queryExpansionId,
    });

    let searchResult = await scrydex.searchCards({
      q: query,
      include: 'prices,images',
      pageSize: 1,
    });

    let card = searchResult.data?.[0];

    // ═══════════════════════════════════════════════════════════════════════════
    // FALLBACK 1: DISABLED FOR SUBSET CARDS (SV/TG/GG)
    // The numeric-only fallback was causing WRONG matches:
    //   - "SV65" → "65" would match card #65 in main set (e.g., Sabrina's Suggestion)
    //   - Instead of SV65 in Shiny Vault (e.g., Zygarde GX)
    // For subset cards, we skip directly to the wildcard search (Fallback 3)
    // ═══════════════════════════════════════════════════════════════════════════
    // NOTE: This fallback is intentionally commented out for subset cards
    // The old logic would strip the prefix and find the WRONG card:
    // if (!card && alternateCardNumber) { ... }
    //
    // Now we skip to FALLBACK 3 (wildcard search) for subset cards

    // ═══════════════════════════════════════════════════════════════════════════
    // FALLBACK 2: Try with zero-padded number (e.g., "TG07" instead of "TG7")
    // ═══════════════════════════════════════════════════════════════════════════
    if (!card) {
      const subsetMatch = cardNumber.match(/^(TG|GG|SV)(\d+)$/i);
      if (subsetMatch) {
        const prefix = subsetMatch[1].toUpperCase();
        const num = subsetMatch[2];
        // Try zero-padded if not already (e.g., TG7 -> TG07)
        const paddedNum = num.padStart(2, '0');
        if (paddedNum !== num) {
          const paddedQuery = `expansion.id:${queryExpansionId} number:${prefix}${paddedNum}`;

          logger.info('SCRYDEX_QUERY_PADDED', {
            originalQuery: query,
            paddedQuery,
            reason: 'Trying zero-padded format',
          });

          searchResult = await scrydex.searchCards({
            q: paddedQuery,
            include: 'prices,images',
            pageSize: 1,
          });

          card = searchResult.data?.[0];

          if (card) {
            logger.info('SCRYDEX_PADDED_SUCCESS', {
              originalNumber: cardNumber,
              matchedNumber: `${prefix}${paddedNum}`,
              cardId: card.id,
              cardName: card.name,
            });
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FALLBACK 3: Use expansion-scoped endpoint with wildcard (API docs recommended)
    // GET /pokemon/v1/expansions/{id}/cards?q=number:TG*
    // ═══════════════════════════════════════════════════════════════════════════
    if (!card) {
      const subsetMatch = cardNumber.match(/^(TG|GG|SV)(\d+)$/i);
      if (subsetMatch) {
        const prefix = subsetMatch[1].toUpperCase();
        const numericPart = subsetMatch[2];

        logger.info('SCRYDEX_EXPANSION_SCOPED_WILDCARD', {
          expansion: queryExpansionId,
          prefix,
          numericPart,
          reason: 'Using expansion-scoped endpoint with wildcard',
        });

        try {
          // Use the expansion-scoped endpoint with wildcard: number:TG*
          const wildcardResult = await scrydex.searchCardsInExpansion(scrydexExpansionId, {
            q: `number:${prefix}*`,
            include: 'prices,images',
            pageSize: 50,
          });

          if (wildcardResult.data && wildcardResult.data.length > 0) {
            // Find the exact match from wildcard results
            const exactMatch = wildcardResult.data.find((c: ScrydexCard) => {
              const cardNum = (c.number?.toString() || '').toUpperCase();
              const targetNum = cardNumber.toUpperCase();
              const targetNumeric = numericPart.replace(/^0+/, '') || numericPart;
              const paddedNumeric = numericPart.padStart(2, '0');

              return cardNum === targetNum ||
                     cardNum === `${prefix}${targetNumeric}` ||
                     cardNum === `${prefix}${paddedNumeric}` ||
                     cardNum === targetNumeric ||
                     cardNum === paddedNumeric;
            });

            if (exactMatch) {
              card = exactMatch;
              logger.info('SCRYDEX_WILDCARD_SUCCESS', {
                originalNumber: cardNumber,
                matchedNumber: card.number,
                cardId: card.id,
                cardName: card.name,
                totalWildcardResults: wildcardResult.data.length,
              });
            }
          }
        } catch (wildcardErr) {
          logger.debug('SCRYDEX_WILDCARD_ERROR', {
            error: wildcardErr instanceof Error ? wildcardErr.message : 'Unknown',
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FALLBACK 3.5: Wildcard search for standard cards (not TG/GG/SV)
    // Handles cards with leading zeros, number variations, SIR cards (201/165), etc.
    // ═══════════════════════════════════════════════════════════════════════════
    if (!card && cardNumber) {
      // Only try if we haven't already done a subset wildcard search
      const isSubsetCard = /^(TG|GG|SV)\d+$/i.test(cardNumber);
      if (!isSubsetCard) {
        // Extract numeric portion and try wildcard
        const numericOnly = cardNumber.replace(/^0+/, '') || cardNumber;

        logger.info('SCRYDEX_STANDARD_WILDCARD', {
          expansion: queryExpansionId,
          cardNumber,
          numericOnly,
          reason: 'Trying wildcard search for standard card number',
        });

        try {
          // Use expansion-scoped endpoint with wildcard on the card number
          // Increased pageSize to 50 to handle SIR cards in large sets
          const wildcardResult = await scrydex.searchCardsInExpansion(scrydexExpansionId, {
            q: `number:${numericOnly}*`,
            include: 'prices,images',
            pageSize: 50,
          });

          if (wildcardResult.data && wildcardResult.data.length > 0) {
            // Find the exact match from wildcard results
            const exactMatch = wildcardResult.data.find((c: ScrydexCard) => {
              const cardNum = (c.number?.toString() || '').replace(/^0+/, '');
              const targetNum = cardNumber.replace(/^0+/, '');
              const paddedTarget = cardNumber.padStart(3, '0');

              return cardNum === targetNum ||
                     cardNum === cardNumber ||
                     c.number?.toString() === paddedTarget ||
                     c.number?.toString() === cardNumber;
            });

            if (exactMatch) {
              card = exactMatch;
              logger.info('SCRYDEX_STANDARD_WILDCARD_SUCCESS', {
                originalNumber: cardNumber,
                matchedNumber: card.number,
                cardId: card.id,
                cardName: card.name,
                totalWildcardResults: wildcardResult.data.length,
              });
            }
          }

          // ───────────────────────────────────────────────────────────────────────
          // FALLBACK 3.5b: Try direct number query (no wildcard) for SIR cards
          // High-numbered cards (>100) might not match wildcards properly
          // ───────────────────────────────────────────────────────────────────────
          if (!card && parseInt(numericOnly, 10) > 100) {
            logger.info('SCRYDEX_SIR_DIRECT_QUERY', {
              expansion: scrydexExpansionId,
              cardNumber: numericOnly,
              reason: 'High card number - trying direct query for SIR card',
            });

            const directResult = await scrydex.searchCardsInExpansion(scrydexExpansionId, {
              q: `number:${numericOnly}`,
              include: 'prices,images',
              pageSize: 5,
            });

            if (directResult.data && directResult.data.length > 0) {
              card = directResult.data[0];
              logger.info('SCRYDEX_SIR_DIRECT_SUCCESS', {
                originalNumber: cardNumber,
                matchedNumber: card.number,
                cardId: card.id,
                cardName: card.name,
              });
            }
          }
        } catch (wildcardErr) {
          logger.debug('SCRYDEX_STANDARD_WILDCARD_ERROR', {
            error: wildcardErr instanceof Error ? wildcardErr.message : 'Unknown',
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FALLBACK 4: Name-based search within expansion (last resort)
    // ═══════════════════════════════════════════════════════════════════════════
    if (!card && parsed.cardName && parsed.cardName.length >= 3) {
      // Use the expansion-scoped endpoint with name search
      // Use the main expansion (not subset) for name-based search, but still map to Scrydex ID
      const nameSearchExpansionId = expansionService.getScrydexId(expansion.id);

      logger.info('SCRYDEX_QUERY_BY_NAME', {
        originalQuery: query,
        expansion: nameSearchExpansionId,
        localExpansion: nameSearchExpansionId !== expansion.id ? expansion.id : undefined,
        cardName: parsed.cardName,
        reason: 'Number queries failed, trying name-based search',
      });

      try {
        // Use expansion-scoped endpoint for more reliable results
        searchResult = await scrydex.searchCardsInExpansion(nameSearchExpansionId, {
          q: `name:${parsed.cardName.toLowerCase()}`,
          include: 'prices,images',
          pageSize: 10,
        });

        // Try to find a card with matching number
        const matchingCard = searchResult.data?.find((c: ScrydexCard) => {
          const cardNum = c.number?.toString() || '';
          const parsedNum = cardNumber.replace(/^0+/, '');
          // Check if card number matches (with or without prefix)
          return cardNum === parsedNum ||
                 cardNum === cardNumber ||
                 cardNum.replace(/^0+/, '') === parsedNum ||
                 (alternateCardNumber && cardNum === alternateCardNumber);
        });

        if (matchingCard) {
          card = matchingCard;
          logger.info('SCRYDEX_NAME_MATCH_SUCCESS', {
            searchedName: parsed.cardName,
            matchedCard: card.name,
            matchedNumber: card.number,
            cardId: card.id,
          });
        }
      } catch (nameErr) {
        logger.debug('SCRYDEX_NAME_SEARCH_ERROR', {
          error: nameErr instanceof Error ? nameErr.message : 'Unknown',
        });
      }
    }

    if (!card) {
      // ═══════════════════════════════════════════════════════════════════════
      // FALLBACK 5: Try searching by name + number across RECENT expansions
      // Uses Scrydex OR query to search multiple expansions in ONE API call
      // Example: (expansion.id:sv10 OR expansion.id:sv09 OR expansion.id:sv8) number:193
      // ═══════════════════════════════════════════════════════════════════════
      if (parsed.cardName && cardNumber) {
        const recentExpansionIds = expansionService.getRecentExpansionIds(8);
        // Remove the already-tried expansion from the list
        const candidateExpansions = recentExpansionIds
          .filter(id => id !== queryExpansionId && id !== scrydexExpansionId)
          .slice(0, 5); // Limit to 5 expansions in OR query

        if (candidateExpansions.length > 0) {
          // Build OR query for multiple expansions: (expansion.id:X OR expansion.id:Y)
          const scrydexIds = candidateExpansions.map(id => expansionService.getScrydexId(id));
          const orClause = scrydexIds.map(id => `expansion.id:${id}`).join(' OR ');
          const orQuery = `(${orClause}) number:${cardNumber}`;

          logger.debug('FALLBACK_OR_QUERY', {
            itemId: listing.itemId,
            cardName: parsed.cardName,
            cardNumber,
            query: orQuery,
            candidateCount: candidateExpansions.length,
          });

          try {
            const fallbackResult = await scrydex.searchCards({
              q: orQuery,
              include: 'prices,images',
              pageSize: 10, // Get multiple results to find best name match
            });

            if (fallbackResult.data && fallbackResult.data.length > 0) {
              // Find the best matching card by name similarity
              let bestCard: ScrydexCard | null = null;
              let bestSimilarity = 0;
              let bestExpansionId: string | null = null;

              for (const candidateCard of fallbackResult.data as ScrydexCard[]) {
                if (parsed.cardName) {
                  const similarity = this.calculateNameSimilarity(parsed.cardName, candidateCard.name);
                  if (similarity > bestSimilarity && similarity >= 0.25) {
                    bestSimilarity = similarity;
                    bestCard = candidateCard;
                    bestExpansionId = candidateCard.expansion?.id || null;
                  }
                } else {
                  // No name to compare, take first result
                  bestCard = candidateCard;
                  bestExpansionId = candidateCard.expansion?.id || null;
                  break;
                }
              }

              if (bestCard && bestExpansionId) {
                logger.info('FALLBACK_OR_QUERY_MATCH', {
                  itemId: listing.itemId,
                  originalExpansion: expansion.id,
                  matchedExpansion: bestExpansionId,
                  cardId: bestCard.id,
                  cardName: bestCard.name,
                  nameSimilarity: bestSimilarity.toFixed(2),
                  queryType: 'or_multi_expansion',
                });

                // Get the expansion object for the matched card
                const fallbackExpansion = expansionService.getExpansion(bestExpansionId);
                if (fallbackExpansion) {
                  card = bestCard;
                  corpusService.trackMatch();
                  this.trackDiagnostic('successfulMatches');
                  return this.processMatchedCard(listing, parsed, fallbackExpansion, card, 'or_query_fallback');
                }
              }
            }
          } catch (fallbackErr) {
            logger.debug('FALLBACK_OR_QUERY_ERROR', {
              error: fallbackErr instanceof Error ? fallbackErr.message : 'Unknown',
            });
          }
        }
      }

      // Cache the failed query to avoid repeating it
      this.queriedCards.set(cardSignature, { found: false });
      this.failedQueries.set(cardSignature, Date.now());
      logger.info('SCRYDEX_NO_MATCH', { query, alternateCardNumber, resultsCount: 0, cached: true });
      corpusService.trackSkip('Card not found in Scrydex');
      this.trackDiagnostic('stage8_scrydexNotFound');

      return { success: false, reason: 'Card not found in Scrydex' };
    }
    
    // Cache the successful result WITH full card data
    this.queriedCards.set(cardSignature, { found: true, cardId: card.id, cardData: card });
    logger.debug('CARD_CACHE_STORED', { cardSignature, cardId: card.id });

    // Track successful Scrydex match
    corpusService.trackMatch();
    this.trackDiagnostic('successfulMatches');

    return this.processMatchedCard(listing, parsed, expansion, card, expansionMatch.match.matchType);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Process a matched card
  // ───────────────────────────────────────────────────────────────────────────

  private async processMatchedCard(
    listing: EbayListing,
    parsed: ParsedTitle,
    expansion: { id: string; name: string; languageCode: string; logo?: string | null; symbol?: string | null; release_date?: string; printedTotal?: number },
    card: ScrydexCard,
    matchType: string
  ): Promise<ProcessResult> {
    logger.info('SCRYDEX_CARD_FOUND', {
      cardId: card.id,
      cardName: card.name,
      variantsCount: card.variants?.length || 0,
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDATION 1: Printed Total Check (prevents Base Set vs Base Set 2 confusion)
    // RELAXED: Skip for subset cards and secret rares, use ±15 tolerance
    // ═══════════════════════════════════════════════════════════════════════════
    if (parsed.printedNumber) {
      const denomMatch = parsed.printedNumber.match(/\/(\d+)$/);
      if (denomMatch) {
        const listingDenom = parseInt(denomMatch[1], 10);
        const expansionTotal = expansion.printedTotal || card.expansion?.printed_total;
        const cardNum = card.number?.toString() || '';

        // Skip validation for subset cards
        const isSubsetCard = /^(TG|GG|SV|RC|H)\d+$/i.test(cardNum);

        // Skip validation for secret rares
        const numericPart = parseInt(cardNum.replace(/\D/g, ''), 10) || 0;
        const isSecretRare = expansionTotal && numericPart > expansionTotal;

        if (expansionTotal && !isSubsetCard && !isSecretRare && Math.abs(listingDenom - expansionTotal) > 15) {
          logger.warn('PRINTED_TOTAL_MISMATCH', {
            itemId: listing.itemId,
            title: listing.title.substring(0, 80),
            listingDenominator: listingDenom,
            expansionPrintedTotal: expansionTotal,
            expansionId: expansion.id,
            expansionName: expansion.name,
            cardId: card.id,
            reason: 'Card number denominator does not match expansion printed total - likely wrong set match',
          });
          return { success: false, matched: true, reason: `Printed total mismatch: listing shows /${listingDenom} but ${expansion.name} has ${expansionTotal} cards` };
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDATION 2: Card Name Cross-Check (prevents matching wrong cards)
    // ═══════════════════════════════════════════════════════════════════════════
    if (parsed.cardName && card.name) {
      const similarity = this.calculateNameSimilarity(parsed.cardName, card.name);
      
      // Relaxed from 0.4 to 0.3 to allow more partial matches (e.g., "Pikachu" vs "Pikachu V")
      if (similarity < 0.3) {
        logger.warn('CARD_NAME_MISMATCH', {
          itemId: listing.itemId,
          title: listing.title.substring(0, 80),
          parsedName: parsed.cardName,
          scrydexName: card.name,
          similarity: similarity.toFixed(2),
          cardId: card.id,
          reason: 'Parsed card name does not match Scrydex result - likely wrong card',
        });
        corpusService.trackSkip('Card name mismatch');
        this.trackDiagnostic('stage9_nameMismatch');
        return { success: false, matched: true, reason: `Card name mismatch: parsed "${parsed.cardName}" but Scrydex returned "${card.name}"` };
      }
      
      // Log warnings for borderline cases
      if (similarity < 0.7) {
        logger.info('CARD_NAME_LOW_SIMILARITY', {
          parsedName: parsed.cardName,
          scrydexName: card.name,
          similarity: similarity.toFixed(2),
          message: 'Name similarity is low but above threshold - proceeding with caution',
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONDITION DETERMINATION - Use eBay conditionDescriptors > item specifics > title > default
    // Priority: conditionDescriptor (40001 IDs) > localizedAspects > title parsing > LP default
    // ═══════════════════════════════════════════════════════════════════════════
    let finalCondition: ScrydexCondition = 'LP'; // Default to LP per user requirement
    let finalConditionSource: 'condition_descriptor' | 'item_specifics' | 'title' | 'default' = 'default';

    // 1. First priority: eBay API condition (mappedCondition from client)
    // This could be from conditionDescriptors (most reliable), item specifics, or title
    if (listing.mappedCondition) {
      finalCondition = listing.mappedCondition;
      finalConditionSource = listing.conditionSource || 'default';
      logger.debug('CONDITION_DETERMINED', {
        itemId: listing.itemId,
        source: finalConditionSource,
        rawCondition: listing.cardCondition,
        mappedCondition: listing.mappedCondition,
        descriptorId: listing.conditionDescriptorId,
      });
    }
    // 2. Fallback: parsed from listing title (if client didn't determine condition)
    else if (parsed.condition) {
      finalCondition = parsed.condition as ScrydexCondition;
      finalConditionSource = 'title';
      logger.debug('CONDITION_FROM_TITLE_FALLBACK', {
        itemId: listing.itemId,
        parsedCondition: parsed.condition,
        source: 'title',
      });
    }
    // 3. Default: LP (conservative - user specified if no condition, use LP price)
    else {
      finalConditionSource = 'default';
      logger.debug('CONDITION_DEFAULT_LP', {
        itemId: listing.itemId,
        reason: 'No condition from API or title',
      });
    }

    // Extract card details for price matching
    const cardDetails: CardDetails = {
      isGraded: parsed.isGraded,
      gradingCompany: parsed.gradingCompany,
      grade: parsed.grade,
      condition: finalCondition,
    };

    // Find matching price
    const priceResult = this.findMatchingPrice(card, cardDetails, parsed);
    if (!priceResult) {
      logger.debug('NO_PRICE_MATCH', {
        itemId: listing.itemId,
        cardId: card.id,
        cardName: card.name,
        isGraded: cardDetails.isGraded,
        gradingCompany: cardDetails.gradingCompany,
        grade: cardDetails.grade,
        condition: cardDetails.condition,
        variantsAvailable: card.variants?.map(v => v.name) || [],
        pricesAvailable: card.variants?.map(v => ({
          variant: v.name,
          priceCount: v.prices?.length || 0,
        })) || [],
        title: listing.title.substring(0, 80),
      });
      this.trackDiagnostic('stage10_noPriceMatch');
      return { success: false, matched: true, reason: 'No matching price found' };
    }

    logger.info('PRICE_FOUND', {
      type: priceResult.type,
      market: priceResult.market,
      currency: priceResult.currency,
      variantUsed: priceResult.variantName,
      allPricesCount: priceResult.allPrices?.length || 0,
    });

    // Calculate arbitrage
    const ebayPriceGBP = listing.price + (listing.shippingCost || 0);
    const shippingGBP = listing.shippingCost || 0;
    const marketPriceUSD = priceResult.market || 0;
    
    // Convert market price from USD to GBP
    const rates = await exchangeRate.getRates();
    const usdRate = rates.rates.USD;
    const marketPriceGBP = marketPriceUSD / usdRate;

    const profitGBP = marketPriceGBP - ebayPriceGBP;
    const discountPercent = marketPriceGBP > 0 ? ((marketPriceGBP - ebayPriceGBP) / marketPriceGBP) * 100 : 0;

    logger.info('ARBITRAGE_CALC', {
      ebayPrice: ebayPriceGBP,
      marketValueGBP: marketPriceGBP,
      profitGBP,
      discountPercent,
    });

    // Check minimum profit (from user preferences)
    if (profitGBP < this.minProfitGBP) {
      this.trackDiagnostic('stage11_belowProfit');
      return { success: false, matched: true, reason: `Profit £${profitGBP.toFixed(2)} below minimum £${this.minProfitGBP}` };
    }

    // Check thresholds
    const tier = this.determineTier(marketPriceGBP, discountPercent);
    if (!tier) {
      this.trackDiagnostic('stage12_belowThreshold');
      return { success: false, matched: true, reason: 'Does not meet threshold' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UNGRADED CONDITION FILTER - Skip if condition not in user's allowed list
    // ═══════════════════════════════════════════════════════════════════════════
    if (!cardDetails.isGraded && cardDetails.condition) {
      const conditionAllowed = this.ungradedConditions.includes(cardDetails.condition);
      if (!conditionAllowed) {
        logger.debug('LISTING_SKIPPED', {
          itemId: listing.itemId,
          reason: 'Condition not in allowed list',
          condition: cardDetails.condition,
          allowedConditions: this.ungradedConditions,
          title: listing.title.substring(0, 80),
        });
        return { success: false, matched: true, reason: `Condition ${cardDetails.condition} not in allowed list` };
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GRADED CARD FILTERS - Check grading company and grade range preferences
    // ═══════════════════════════════════════════════════════════════════════════
    if (cardDetails.isGraded) {
      // Check if grading company is in preferred list
      if (cardDetails.gradingCompany && this.preferredGradingCompanies.length > 0) {
        const normalizedCompany = this.normalizeGradingCompany(cardDetails.gradingCompany);
        const isPreferredCompany = this.preferredGradingCompanies.some(
          pref => this.normalizeGradingCompany(pref) === normalizedCompany
        );
        if (!isPreferredCompany) {
          logger.debug('LISTING_SKIPPED', {
            itemId: listing.itemId,
            reason: 'Grading company not in preferred list',
            company: cardDetails.gradingCompany,
            preferredCompanies: this.preferredGradingCompanies,
            title: listing.title.substring(0, 80),
          });
          return { success: false, matched: true, reason: `Grading company ${cardDetails.gradingCompany} not in preferred list` };
        }
      }

      // Check if grade is within allowed range
      if (cardDetails.grade !== undefined && cardDetails.grade !== null) {
        const gradeNum = parseFloat(cardDetails.grade);
        if (!isNaN(gradeNum)) {
          if (gradeNum < this.minGrade || gradeNum > this.maxGrade) {
            logger.debug('LISTING_SKIPPED', {
              itemId: listing.itemId,
              reason: 'Grade outside allowed range',
              grade: cardDetails.grade,
              minGrade: this.minGrade,
              maxGrade: this.maxGrade,
              title: listing.title.substring(0, 80),
            });
            return { success: false, matched: true, reason: `Grade ${cardDetails.grade} outside range ${this.minGrade}-${this.maxGrade}` };
          }
        }
      }
    }

    // Get card image - check card level first, then fall back to variant images
    let cardImageUrl: string | null = null;

    // Debug: log available images
    logger.debug('CARD_IMAGES_DEBUG', {
      cardId: card.id,
      hasImages: !!card.images,
      imagesCount: card.images?.length || 0,
      firstImage: card.images?.[0] || null,
      hasVariants: !!card.variants,
      variantsCount: card.variants?.length || 0,
    });

    // Try card-level images first
    if (card.images && card.images.length > 0) {
      const img = card.images[0];
      cardImageUrl = img.large || img.medium || img.small || null;
      logger.debug('CARD_IMAGE_EXTRACTED', { source: 'card', url: cardImageUrl });
    }

    // Fall back to variant images if no card-level image
    if (!cardImageUrl && card.variants && card.variants.length > 0) {
      for (const variant of card.variants) {
        if (variant.images && variant.images.length > 0) {
          const img = variant.images[0];
          cardImageUrl = img.large || img.medium || img.small || null;
          if (cardImageUrl) {
            logger.debug('CARD_IMAGE_EXTRACTED', { source: 'variant', variantName: variant.name, url: cardImageUrl });
            break;
          }
        }
      }
    }

    if (!cardImageUrl) {
      logger.warn('NO_CARD_IMAGE_FOUND', { cardId: card.id, cardName: card.name });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FIXED: Construct eBay URL properly - itemWebUrl from API can be empty
    // ═══════════════════════════════════════════════════════════════════════════
    const ebayItemUrl = (listing.url && listing.url.includes('/itm/'))
      ? listing.url
      : `https://www.ebay.co.uk/itm/${listing.itemId}`;
    
    logger.debug('EBAY_URL_CONSTRUCTED', {
      listingUrl: listing.url || 'none',
      itemId: listing.itemId,
      constructedUrl: ebayItemUrl,
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // EXTRACT SELLER FEEDBACK PERCENTAGE
    // eBay API returns feedbackPercentage as number (already parsed in client)
    // ═══════════════════════════════════════════════════════════════════════════
    const sellerFeedbackPercent = listing.seller?.feedbackPercentage ?? null;
    const now = new Date();
    const variantName = priceResult.variantName ?? null;

    // Create deal (matching your Deal interface exactly)
    const deal: Deal = {
      id: uuidv4(),
      ebayItemId: listing.itemId,
      ebayUrl: ebayItemUrl,
      affiliateUrl: generateAffiliateUrl(ebayItemUrl),
      title: listing.title,
      imageUrl: listing.imageUrl || cardImageUrl || '',
      
      cardId: card.id,
      cardName: card.name,
      expansionId: expansion.id,
      expansionName: expansion.name,
      expansion: expansion.name,
      cardNumber: card.number,
      
      isGraded: cardDetails.isGraded,
      gradingCompany: cardDetails.gradingCompany,
      grade: cardDetails.grade,
      rawCondition: cardDetails.condition,
      condition: cardDetails.condition,
      variant: variantName,
      detectedVariant: variantName,

      // eBay condition from item specifics
      ebayCondition: listing.cardCondition || null,
      ebayConditionId: listing.conditionId || null,
      conditionSource: finalConditionSource,
      
      // Pricing - include both naming conventions
      ebayPrice: ebayPriceGBP,
      ebayPriceGBP,
      shippingCost: shippingGBP,
      shippingGBP,
      totalCost: ebayPriceGBP,
      totalCostGBP: ebayPriceGBP,
      marketValueUSD: marketPriceUSD,
      marketValueGBP: marketPriceGBP,
      exchangeRate: usdRate,
      
      profitGBP,
      profitPercent: discountPercent,
      discountPercent,
      tier,
      
      // Seller info - include both naming conventions
      seller: listing.seller.username,
      sellerName: listing.seller.username,
      sellerFeedback: listing.seller.feedbackScore,
      sellerFeedbackPercent,
      
      // Item location info (for international badge)
      itemLocation: listing.location || '',
      itemCountry: listing.country || '',
      
      // Timestamps - include both naming conventions
      foundAt: now,
      listingTime: listing.listingTime,
      discoveredAt: now,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      
      matchConfidence: parsed.confidenceScore,
      matchType,
      
      // Include match details for training/debugging
      matchDetails: {
        isFirstEdition: parsed.isFirstEdition || false,
        isShadowless: parsed.isShadowless || false,
        isHolo: parsed.variant?.isHolo || false,
        isReverseHolo: parsed.variant?.isReverseHolo || false,
        parsedSetName: parsed.setName || '',
        parsedCardNumber: parsed.cardNumber || '',
        parsedName: parsed.cardName || '',
        expansionMatchType: matchType,
        expansionMatchScore: parsed.confidenceScore || 0,
      },
      
      scrydexCard: card,
      scrydexExpansion: expansionService.getById(expansion.id),
      scrydexImageUrl: cardImageUrl,
      expansionLogo: card.expansion?.logo || expansion.logo || null,
      expansionSymbol: card.expansion?.symbol || expansion.symbol || null,
      allPrices: priceResult.allPrices || [],
      cardDetails,
    };

    // Store the deal - use async version to ensure it's actually stored
    logger.info('DEAL_STORE_ATTEMPT', {
      dealId: deal.id,
      ebayItemId: deal.ebayItemId,
      cardName: deal.cardName,
      tier: deal.tier,
      profit: deal.profitGBP,
    });

    let stored = false;
    try {
      stored = await dealStore.addAsync(deal);
      logger.info('DEAL_STORE_RESULT', {
        dealId: deal.id,
        ebayItemId: deal.ebayItemId,
        stored,
      });
      if (!stored) {
        logger.warn('DEAL_NOT_STORED', {
          dealId: deal.id,
          ebayItemId: deal.ebayItemId,
          reason: 'addAsync returned false (likely duplicate)',
        });
      }
    } catch (storeError) {
      logger.error('DEAL_STORE_ERROR', {
        dealId: deal.id,
        ebayItemId: deal.ebayItemId,
        error: storeError instanceof Error ? storeError.message : 'Unknown error',
        stack: storeError instanceof Error ? storeError.stack : undefined,
      });
      stored = false;
    }

    if (stored) {
      // Track deal for analytics
      corpusService.trackDeal();
      this.trackDiagnostic('successfulDeals');

      // ═══════════════════════════════════════════════════════════════════════════
      // ENHANCED LOGGING FOR TRAINING
      // ═══════════════════════════════════════════════════════════════════════════
      logger.info('DEAL_FOUND', {
        dealId: deal.id,
        card: deal.cardName,
        expansion: deal.expansionName,
        tier: deal.tier,
        profit: deal.profitGBP.toFixed(2),
        discount: deal.discountPercent.toFixed(1),
        variant: deal.detectedVariant,
        seller: deal.seller,
        sellerFeedback: deal.sellerFeedback,
        sellerFeedbackPercent: deal.sellerFeedbackPercent,
        location: deal.itemLocation,
        country: deal.itemCountry,
        matchConfidence: deal.matchConfidence,
      });
      
      // Full debug output for training the parser
      logger.debug('DEAL_FULL_DEBUG', {
        ebayTitle: listing.title,
        parsedData: {
          cardName: parsed.cardName,
          cardNumber: parsed.cardNumber,
          printedNumber: parsed.printedNumber,
          setName: parsed.setName,
          confidence: parsed.confidenceScore,
          isGraded: parsed.isGraded,
          gradingCompany: parsed.gradingCompany,
          grade: parsed.grade,
          language: parsed.language,
          languageCode: parsed.languageCode,
          isFirstEdition: parsed.isFirstEdition,
          isShadowless: parsed.isShadowless,
          variant: parsed.variant,
        },
        expansionMatch: {
          expansionId: expansion.id,
          expansionName: expansion.name,
          matchType: matchType,
        },
        scrydexData: {
          cardId: card.id,
          cardName: card.name,
          cardNumber: card.number,
          printedNumber: card.printed_number,
          rarity: card.rarity,
          subtypes: card.subtypes,
        },
        pricing: {
          ebayPriceGBP,
          marketValueUSD: marketPriceUSD,
          marketValueGBP: marketPriceGBP,
          profitGBP,
          discountPercent,
          variantName: priceResult.variantName,
          priceType: priceResult.type,
          priceCount: priceResult.allPrices?.length || 0,
        },
        seller: {
          username: listing.seller.username,
          feedback: listing.seller.feedbackScore,
          feedbackPercent: listing.seller.feedbackPercentage,
          location: deal.itemLocation,
          country: deal.itemCountry,
        },
      });
    }

    // Only return success if the deal was actually stored
    return { success: stored, matched: true, deal: stored ? deal : undefined };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Price Matching Logic
  // ───────────────────────────────────────────────────────────────────────────

  private findMatchingPrice(
    card: ScrydexCard,
    details: CardDetails,
    parsed: ParsedTitle
  ): (ScrydexPrice & { variantName?: string; allPrices?: ScrydexPrice[] }) | null {
    
    // First, try to find variant-specific prices
    if (card.variants && card.variants.length > 0) {
      const variantPrices = this.findVariantPrices(card, details, parsed);
      if (variantPrices) {
        const price = this.selectBestPrice(variantPrices.prices, details);
        if (price) {
          return { ...price, variantName: variantPrices.variantName, allPrices: variantPrices.prices };
        }
      }
    }

    return null;
  }

  private findVariantPrices(
    card: ScrydexCard,
    _details: CardDetails,
    parsed: ParsedTitle
  ): VariantPrices | null {
    if (!card.variants || card.variants.length === 0) return null;

    // ═══════════════════════════════════════════════════════════════════════════
    // Determine target variant based on COMBINED attributes
    // Must handle all combinations of: 1st Edition, Shadowless, Holo, ReverseHolo
    // ═══════════════════════════════════════════════════════════════════════════
    let targetVariant: string | null = null;

    const is1stEd = parsed.isFirstEdition;
    const isShadowless = parsed.isShadowless;
    const isHolo = parsed.variant?.isHolo;
    const isReverseHolo = parsed.variant?.isReverseHolo;

    // Build variant name based on combinations
    if (is1stEd && isShadowless && isHolo) {
      targetVariant = 'firstEditionShadowlessHolofoil';
    } else if (is1stEd && isShadowless) {
      targetVariant = 'firstEditionShadowless';
    } else if (is1stEd && isHolo) {
      targetVariant = 'firstEditionHolofoil';
    } else if (is1stEd && isReverseHolo) {
      targetVariant = 'firstEditionReverseHolofoil';
    } else if (is1stEd) {
      targetVariant = 'firstEdition'; // Non-holo 1st edition
    } else if (isShadowless && isHolo) {
      targetVariant = 'unlimitedShadowlessHolofoil';
    } else if (isShadowless) {
      targetVariant = 'unlimitedShadowless';
    } else if (isReverseHolo) {
      targetVariant = 'reverseHolofoil';
    } else if (isHolo) {
      targetVariant = 'holofoil';
    }
    // If none of the above, targetVariant stays null and we'll use fallback logic

    // Try to find variant match (exact first, then contains)
    if (targetVariant) {
      const targetLower = targetVariant.toLowerCase();
      
      // First try exact match
      let match = card.variants.find(v => 
        v.name.toLowerCase() === targetLower &&
        v.prices && 
        v.prices.length > 0
      );
      
      // If no exact match and target is for 1st Edition, try broader 1st Edition matching
      // This handles cases where Scrydex might name it differently
      if (!match && targetLower.includes('firstedition')) {
        // Extract the suffix (holofoil, normal, etc.) if present
        const suffix = targetLower.replace('firstedition', '').replace('shadowless', '');
        
        match = card.variants.find(v => {
          const vLower = v.name.toLowerCase();
          const isFirstEd = vLower.includes('firstedition') || vLower.includes('1stedition');
          const hasSuffix = suffix ? vLower.includes(suffix) : true;
          const matchesShadowless = targetLower.includes('shadowless') === vLower.includes('shadowless');
          return isFirstEd && hasSuffix && matchesShadowless && v.prices && v.prices.length > 0;
        });
      }
      
      // For non-1st-edition holos, try unlimitedHolofoil as fallback
      if (!match && targetLower === 'holofoil') {
        match = card.variants.find(v => 
          v.name.toLowerCase() === 'unlimitedholofoil' &&
          v.prices && 
          v.prices.length > 0
        );
      }
      
      if (match?.prices && match.prices.length > 0) {
        logger.info('VARIANT_MATCHED', {
          requestedVariant: targetVariant,
          matchedVariant: match.name,
          availableVariants: card.variants.map(v => v.name),
        });
        logger.info('VARIANT_PRICES', {
          variantName: match.name,
          priceCount: match.prices.length,
          rawPrices: match.prices.filter(p => p.type === 'raw').length,
          gradedPrices: match.prices.filter(p => p.type === 'graded').length,
        });
        return { variantName: match.name, prices: match.prices };
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FIXED: For cards without explicit 1st Edition marker, prefer UNLIMITED
    // This prevents using expensive 1st Edition prices for regular listings
    // ═══════════════════════════════════════════════════════════════════════════
    
    // First, check if this is a WOTC-era set with both 1st Ed and Unlimited variants
    const hasFirstEdition = card.variants.some(v => 
      v.name.toLowerCase().includes('firstedition') || 
      v.name.toLowerCase().includes('1stedition')
    );
    const hasUnlimited = card.variants.some(v => 
      v.name.toLowerCase().includes('unlimited') && 
      !v.name.toLowerCase().includes('firstedition')
    );
    
    // If both exist and listing is NOT marked as 1st Edition, prefer unlimited
    if (hasFirstEdition && hasUnlimited && !parsed.isFirstEdition) {
      const unlimitedVariant = card.variants.find(v => 
        v.name.toLowerCase().includes('unlimited') && 
        !v.name.toLowerCase().includes('firstedition') &&
        v.prices && 
        v.prices.length > 0
      );
      if (unlimitedVariant && unlimitedVariant.prices) {
        logger.info('VARIANT_DEFAULTED_UNLIMITED', {
          reason: 'Listing not marked as 1st Edition - using Unlimited pricing',
          matchedVariant: unlimitedVariant.name,
          availableVariants: card.variants.map(v => v.name),
        });
        logger.info('VARIANT_PRICES', {
          variantName: unlimitedVariant.name,
          priceCount: unlimitedVariant.prices.length,
          rawPrices: unlimitedVariant.prices.filter(p => p.type === 'raw').length,
          gradedPrices: unlimitedVariant.prices.filter(p => p.type === 'graded').length,
        });
        return { variantName: unlimitedVariant.name, prices: unlimitedVariant.prices };
      }
    }

    // Fallback for modern sets: prefer non-1st-edition variants
    // Order: unlimitedHolofoil, holofoil, normal, reverseHolofoil, unlimited
    const preferenceOrder = [
      'unlimitedholofoil',
      'unlimitedshadowlessholofoil', 
      'holofoil', 
      'normal', 
      'reverseholofoil', 
      'unlimited'
    ];
    
    for (const pref of preferenceOrder) {
      const variant = card.variants.find(v => 
        v.name.toLowerCase() === pref && 
        v.prices && 
        v.prices.length > 0
      );
      if (variant && variant.prices) {
        logger.info('VARIANT_FALLBACK', {
          matchedVariant: variant.name,
          availableVariants: card.variants.map(v => v.name),
        });
        logger.info('VARIANT_PRICES', {
          variantName: variant.name,
          priceCount: variant.prices.length,
          rawPrices: variant.prices.filter(p => p.type === 'raw').length,
          gradedPrices: variant.prices.filter(p => p.type === 'graded').length,
        });
        return { variantName: variant.name, prices: variant.prices };
      }
    }

    // Last resort: first variant with prices (but NOT 1st edition if unlimited exists)
    let firstWithPrices = card.variants.find(v => 
      v.prices && 
      v.prices.length > 0 &&
      !v.name.toLowerCase().includes('firstedition')
    );
    
    // Only fall back to 1st edition if no other option
    if (!firstWithPrices) {
      firstWithPrices = card.variants.find(v => v.prices && v.prices.length > 0);
    }
    
    if (firstWithPrices && firstWithPrices.prices) {
      logger.info('VARIANT_LAST_RESORT', {
        matchedVariant: firstWithPrices.name,
        availableVariants: card.variants.map(v => v.name),
      });
      logger.info('VARIANT_PRICES', {
        variantName: firstWithPrices.name,
        priceCount: firstWithPrices.prices.length,
        rawPrices: firstWithPrices.prices.filter(p => p.type === 'raw').length,
        gradedPrices: firstWithPrices.prices.filter(p => p.type === 'graded').length,
      });
      return { variantName: firstWithPrices.name, prices: firstWithPrices.prices };
    }

    return null;
  }

  private selectBestPrice(
    prices: ScrydexPrice[],
    details: CardDetails
  ): ScrydexPrice | null {
    // Filter by graded/raw
    if (details.isGraded && details.gradingCompany && details.grade) {
      // Normalize grading company names
      const normalizedCompany = this.normalizeGradingCompany(details.gradingCompany);
      
      // Only use prices from the EXACT grading company
      // Do NOT fall back to other companies (e.g., don't use PSA price for ACE card)
      const gradedPrices = prices.filter(p => 
        p.type === 'graded' &&
        this.normalizeGradingCompany(p.company) === normalizedCompany &&
        p.grade === details.grade
      );

      if (gradedPrices.length > 0) {
        // ═══════════════════════════════════════════════════════════════════════════
        // FIX: When multiple prices exist for same grade (e.g., PSA 10 standard vs 
        // PSA 10 Pristine), prefer the STANDARD price (is_perfect: false, etc.)
        // and sort by LOWEST to avoid false arbitrage opportunities
        // ═══════════════════════════════════════════════════════════════════════════
        
        // Separate standard prices from special prices (perfect/signed/error)
        const standardPrices = gradedPrices.filter(p => 
          !p.is_perfect && !p.is_signed && !p.is_error
        );
        const specialPrices = gradedPrices.filter(p => 
          p.is_perfect || p.is_signed || p.is_error
        );
        
        // Use standard prices if available, otherwise fall back to special
        const pricesToUse = standardPrices.length > 0 ? standardPrices : gradedPrices;
        
        // Sort by LOWEST market price to be conservative (avoid false positives)
        const sortedPrices = pricesToUse.sort((a, b) => {
          const aPrice = a.market || a.mid || a.low || 0;
          const bPrice = b.market || b.mid || b.low || 0;
          return aPrice - bPrice;  // ASCENDING - picks lowest/most conservative
        });
        
        const selectedPrice = sortedPrices[0];
        
        logger.info('GRADED_PRICE_MATCHED', {
          company: normalizedCompany,
          grade: details.grade,
          priceCount: gradedPrices.length,
          standardPriceCount: standardPrices.length,
          specialPriceCount: specialPrices.length,
          selectedMarket: selectedPrice.market,
          selectedIsPerfect: selectedPrice.is_perfect || false,
        });
        
        return selectedPrice;
      }

      // Try same company, different grade (close grades)
      const sameCompany = prices.filter(p =>
        p.type === 'graded' &&
        this.normalizeGradingCompany(p.company) === normalizedCompany
      );
      
      if (sameCompany.length > 0) {
        logger.info('GRADED_PRICE_COMPANY_MATCH', {
          company: normalizedCompany,
          requestedGrade: details.grade,
          availableGrades: sameCompany.map(p => p.grade),
        });
        return sameCompany[0];
      }

      // NO FALLBACK to other companies!
      // If we can't find prices for this specific grading company, skip the deal
      logger.warn('GRADED_PRICE_NO_MATCH', {
        company: normalizedCompany,
        grade: details.grade,
        availableCompanies: [...new Set(prices.filter(p => p.type === 'graded').map(p => p.company))],
        message: `No prices available for ${normalizedCompany} graded cards - skipping to avoid false positives`,
      });
      
      return null;
    }

    // Raw card pricing
    const rawPrices = prices.filter(p => p.type === 'raw');
    
    if (details.condition) {
      const conditionMatch = rawPrices.find(p => 
        p.condition?.toUpperCase() === details.condition?.toUpperCase()
      );
      if (conditionMatch) return conditionMatch;
    }

    const nmPrice = rawPrices.find(p => p.condition === 'NM');
    if (nmPrice) return nmPrice;

    if (rawPrices.length > 0) return rawPrices[0];

    return prices[0] || null;
  }

  // Normalize grading company names (ACE = AGS, Beckett = BGS, etc.)
  private normalizeGradingCompany(company: string | undefined): string {
    if (!company) return '';
    const upper = company.toUpperCase().trim();
    
    // Map equivalent company names
    const aliases: Record<string, string> = {
      'AGS': 'ACE',     // AGS is often used for ACE
      'BECKETT': 'BGS', // Beckett Grading Services
      'PROFESSIONAL SPORTS AUTHENTICATOR': 'PSA',
      'CERTIFIED GUARANTY COMPANY': 'CGC',
    };
    
    return aliases[upper] || upper;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Name Similarity Calculator (for card name validation)
  // Uses token-based Jaccard similarity with Pokemon name normalization
  // ═══════════════════════════════════════════════════════════════════════════
  
  private calculateNameSimilarity(parsedName: string, scrydexName: string): number {
    // ─────────────────────────────────────────────────────────────────────────
    // SPECIAL CASE: Nidoran gender must match exactly (they're different cards)
    // ─────────────────────────────────────────────────────────────────────────
    const normalizeNidoranGender = (name: string): string | null => {
      const lower = name.toLowerCase();
      if (lower.includes('nidoran')) {
        // Check for female indicators
        if (lower.includes('♀') || lower.includes('nidoran f') || lower.includes('female')) {
          return 'female';
        }
        // Check for male indicators
        if (lower.includes('♂') || lower.includes('nidoran m') || lower.includes(' male')) {
          return 'male';
        }
        // Nidoran without gender indicator
        return 'unknown';
      }
      return null; // Not a Nidoran
    };

    const parsedNidoranGender = normalizeNidoranGender(parsedName);
    const scrydexNidoranGender = normalizeNidoranGender(scrydexName);

    // If both are Nidoran, genders must match
    if (parsedNidoranGender && scrydexNidoranGender) {
      if (parsedNidoranGender !== scrydexNidoranGender &&
          parsedNidoranGender !== 'unknown' &&
          scrydexNidoranGender !== 'unknown') {
        logger.debug('NIDORAN_GENDER_MISMATCH', {
          parsedName,
          scrydexName,
          parsedGender: parsedNidoranGender,
          scrydexGender: scrydexNidoranGender,
        });
        return 0; // Complete mismatch - wrong gender
      }
      // Genders match or one is unknown
      return parsedNidoranGender === scrydexNidoranGender ? 1.0 : 0.8;
    }

    // Normalize names
    const normalize = (name: string): string => {
      return name
        .toLowerCase()
        .replace(/[-–—]/g, ' ')              // Dashes to spaces
        .replace(/[''`]/g, "'")              // Normalize apostrophes
        .replace(/[^\w\s']/g, '')            // Remove special chars
        .replace(/\s+/g, ' ')                // Collapse whitespace
        .trim();
    };

    // Common Pokemon name variations to normalize
    // NOTE: Nidoran removed - handled separately above with gender matching
    const pokemonAliases: Record<string, string[]> = {
      'charizard': ['zard'],
      'blastoise': ['stoise'],
      'venusaur': ['saur'],
      'pikachu': ['pika', 'chu'],
      'mewtwo': ['mew two', 'mew 2'],
      'mr mime': ['mr. mime', 'mrmime'],
      'mimejr': ['mime jr', 'mime jr.'],
      'farfetchd': ["farfetch'd", 'farfetch d'],
      'type null': ['type: null', 'typenull'],
      'hooh': ['ho-oh', 'ho oh'],
      'porygonz': ['porygon-z', 'porygon z'],
      'porygon2': ['porygon-2', 'porygon 2'],
      'jangmoo': ['jangmo-o'],
      'hakamoo': ['hakamo-o'],
      'kommoo': ['kommo-o'],
      'tapukoko': ['tapu koko', 'tapu-koko'],
      'tapulele': ['tapu lele', 'tapu-lele'],
      'tapubulu': ['tapu bulu', 'tapu-bulu'],
      'tapufini': ['tapu fini', 'tapu-fini'],
    };
    
    const norm1 = normalize(parsedName);
    const norm2 = normalize(scrydexName);
    
    // Direct match
    if (norm1 === norm2) return 1.0;
    
    // Check if one contains the other (common with EX/GX/V suffixes)
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      return 0.85;
    }
    
    // Check Pokemon aliases
    for (const [canonical, aliases] of Object.entries(pokemonAliases)) {
      const allVariants = [canonical, ...aliases];
      const matched1 = allVariants.some(v => norm1.includes(v));
      const matched2 = allVariants.some(v => norm2.includes(v));
      if (matched1 && matched2) {
        return 0.9;
      }
    }
    
    // Token-based Jaccard similarity
    const tokens1 = new Set(norm1.split(' ').filter(t => t.length > 1));
    const tokens2 = new Set(norm2.split(' ').filter(t => t.length > 1));
    
    if (tokens1.size === 0 || tokens2.size === 0) {
      return 0;
    }
    
    const intersection = [...tokens1].filter(t => tokens2.has(t)).length;
    const union = new Set([...tokens1, ...tokens2]).size;
    
    return intersection / union;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tier Determination
  // ───────────────────────────────────────────────────────────────────────────

  private determineTier(
    marketValueGBP: number,
    discountPercent: number
  ): 'PREMIUM' | 'HIGH' | 'STANDARD' | null {
    if (discountPercent <= 0) return null;

    if (marketValueGBP >= this.thresholds.premium.minValue) {
      if (discountPercent >= this.thresholds.premium.minDiscount) {
        return 'PREMIUM';
      }
      return null;
    }

    if (marketValueGBP >= this.thresholds.high.minValue) {
      if (discountPercent >= this.thresholds.high.minDiscount) {
        return 'HIGH';
      }
      return null;
    }

    if (discountPercent >= this.thresholds.standard.minDiscount) {
      return 'STANDARD';
    }

    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Configuration
  // ───────────────────────────────────────────────────────────────────────────

  setThresholds(thresholds: Partial<ArbitrageThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  getThresholds(): ArbitrageThresholds {
    return { ...this.thresholds };
  }

  clearProcessedListings(): void {
    this.processedListings.clear();
    this.processedListingsTimestamps.clear();
    logger.info('Cleared processed listings cache');
  }

  getProcessedCount(): number {
    return this.processedListings.size;
  }
  
  // ───────────────────────────────────────────────────────────────────────────
  // Query Cache Management (Safeguards)
  // ───────────────────────────────────────────────────────────────────────────
  
  clearQueryCaches(): void {
    this.queriedCards.clear();
    this.failedQueries.clear();
    logger.info('QUERY_CACHES_CLEARED', { 
      message: 'Card signature and failed query caches cleared' 
    });
  }
  
  getQueryCacheStats(): { 
    queriedCards: number; 
    failedQueries: number;
    successfulCards: number;
  } {
    const successful = Array.from(this.queriedCards.values()).filter(v => v.found).length;
    return {
      queriedCards: this.queriedCards.size,
      failedQueries: this.failedQueries.size,
      successfulCards: successful,
    };
  }
  
  // Prune expired failed queries (call periodically)
  pruneExpiredFailedQueries(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, timestamp] of this.failedQueries) {
      if (now - timestamp >= ArbitrageEngine.FAILED_QUERY_TTL_MS) {
        this.failedQueries.delete(key);
        this.queriedCards.delete(key);
        pruned++;
      }
    }

    if (pruned > 0) {
      logger.debug('FAILED_QUERIES_PRUNED', { count: pruned });
    }

    return pruned;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Scan Diagnostics Methods
  // ───────────────────────────────────────────────────────────────────────────

  /** Start a new scan - resets diagnostics counters */
  startScanDiagnostics(): void {
    this.currentScanDiagnostics = createEmptyDiagnostics();
  }

  /** End the current scan and log the diagnostics summary */
  endScanDiagnostics(): ScanDiagnostics {
    this.lastCompletedDiagnostics = { ...this.currentScanDiagnostics };

    // Add to cumulative session diagnostics
    const d = this.currentScanDiagnostics;
    this.sessionScanCount++;
    this.sessionDiagnostics.totalScanned += d.totalScanned;
    this.sessionDiagnostics.stage1_alreadyProcessed += d.stage1_alreadyProcessed;
    this.sessionDiagnostics.stage2_internationalSeller += d.stage2_internationalSeller;
    this.sessionDiagnostics.stage3_nonEnglish += d.stage3_nonEnglish;
    this.sessionDiagnostics.stage4_lowConfidence += d.stage4_lowConfidence;
    this.sessionDiagnostics.stage5_noExpansionMatch += d.stage5_noExpansionMatch;
    this.sessionDiagnostics.stage6_noCardNumber += d.stage6_noCardNumber;
    this.sessionDiagnostics.stage7_printedTotalMismatch += d.stage7_printedTotalMismatch;
    this.sessionDiagnostics.stage8_scrydexNotFound += d.stage8_scrydexNotFound;
    this.sessionDiagnostics.stage9_nameMismatch += d.stage9_nameMismatch;
    this.sessionDiagnostics.stage10_noPriceMatch += d.stage10_noPriceMatch;
    this.sessionDiagnostics.stage11_belowProfit += d.stage11_belowProfit;
    this.sessionDiagnostics.stage12_belowThreshold += d.stage12_belowThreshold;
    this.sessionDiagnostics.successfulMatches += d.successfulMatches;
    this.sessionDiagnostics.successfulDeals += d.successfulDeals;

    // Calculate meaningful rates
    const scrydexAttempts = d.successfulMatches + d.stage8_scrydexNotFound;
    const eligibilityRate = d.totalScanned > 0
      ? ((scrydexAttempts / d.totalScanned) * 100).toFixed(1)
      : '0.0';
    const matchRate = d.totalScanned > 0
      ? ((d.successfulMatches / d.totalScanned) * 100).toFixed(1)
      : '0.0';
    const dealRate = d.successfulMatches > 0
      ? ((d.successfulDeals / d.successfulMatches) * 100).toFixed(1)
      : '0.0';

    logger.info('SCAN_DIAGNOSTICS_SUMMARY', {
      totalScanned: d.totalScanned,
      scrydexAttempts,
      eligibilityRate: `${eligibilityRate}%`,
      matchRate: `${matchRate}%`,
      dealRate: `${dealRate}%`,
      successfulMatches: d.successfulMatches,
      successfulDeals: d.successfulDeals,
      failureBreakdown: {
        alreadyProcessed: d.stage1_alreadyProcessed,
        internationalSeller: d.stage2_internationalSeller,
        nonEnglish: d.stage3_nonEnglish,
        lowConfidence: d.stage4_lowConfidence,
        noExpansionMatch: d.stage5_noExpansionMatch,
        noCardNumber: d.stage6_noCardNumber,
        printedTotalMismatch: d.stage7_printedTotalMismatch,
        scrydexNotFound: d.stage8_scrydexNotFound,
        nameMismatch: d.stage9_nameMismatch,
        noPriceMatch: d.stage10_noPriceMatch,
        belowProfit: d.stage11_belowProfit,
        belowThreshold: d.stage12_belowThreshold,
      },
    });

    return this.lastCompletedDiagnostics;
  }

  /** Get the current scan diagnostics (for real-time monitoring) */
  getCurrentDiagnostics(): ScanDiagnostics {
    return { ...this.currentScanDiagnostics };
  }

  /** Get the last completed scan diagnostics */
  getLastDiagnostics(): ScanDiagnostics | null {
    return this.lastCompletedDiagnostics ? { ...this.lastCompletedDiagnostics } : null;
  }

  /** Get cumulative session diagnostics (across all scans) */
  getSessionDiagnostics(): { diagnostics: ScanDiagnostics; scanCount: number } {
    return {
      diagnostics: { ...this.sessionDiagnostics },
      scanCount: this.sessionScanCount,
    };
  }

  /** Reset session diagnostics (e.g., when starting fresh) */
  resetSessionDiagnostics(): void {
    this.sessionDiagnostics = createEmptyDiagnostics();
    this.sessionScanCount = 0;
  }

  /** Track a diagnostic event */
  private trackDiagnostic(stage: keyof ScanDiagnostics): void {
    if (stage in this.currentScanDiagnostics) {
      (this.currentScanDiagnostics[stage] as number)++;
    }
  }
}

export const arbitrageEngine = new ArbitrageEngine();