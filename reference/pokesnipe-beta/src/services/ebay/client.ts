// src/services/ebay/client.ts
// ═══════════════════════════════════════════════════════════════════════════
// eBay Browse API Client - Handles authentication and search requests
// ═══════════════════════════════════════════════════════════════════════════

import axios from 'axios';
import type {
  EbayListing,
  EbaySearchParams,
  EbaySearchResult,
  EbayBrowseApiResponse,
  EbayBrowseApiItem,
  EbayImage,
  EbayRateLimitsResponse,
  EbayRateLimitStatus,
} from './types.js';
import { getAccessToken, getTokenInfo } from './auth.js';
import { getListingCondition } from './condition-mapper.js';
import { logger } from '../../utils/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const EBAY_API_BASE = 'https://api.ebay.com';
const BROWSE_API_VERSION = 'v1';

// Pokemon TCG category IDs
const POKEMON_CATEGORY_ID = '183454'; // CCG Individual Cards

// Sort order mapping
const sortMap: Record<string, string> = {
  newlyListed: 'newlyListed',
  endingSoonest: 'endingSoonest',
  price: 'price',
  priceDesc: '-price',
};

// Rate limit configuration
const RATE_LIMIT_BACKOFF_MS = 60000; // 1 minute initial backoff
const RATE_LIMIT_MAX_BACKOFF_MS = 300000; // 5 minutes max backoff

// ─────────────────────────────────────────────────────────────────────────────
// eBay Client Class
// ─────────────────────────────────────────────────────────────────────────────

class EbayClient {
  private baseUrl: string;

  // Rate limit tracking (local fallback)
  private rateLimitedUntil: number = 0;
  private rateLimitBackoff: number = RATE_LIMIT_BACKOFF_MS;
  private consecutiveRateLimits: number = 0;

  // Cached rate limit data from Analytics API
  private cachedRateLimits: EbayRateLimitStatus | null = null;
  private rateLimitsCacheTime: number = 0;
  private readonly RATE_LIMITS_CACHE_MS = 30000; // Cache for 30 seconds

  constructor() {
    this.baseUrl = `${EBAY_API_BASE}/buy/browse/${BROWSE_API_VERSION}`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rate Limit Management
  // ───────────────────────────────────────────────────────────────────────────

  isRateLimited(): boolean {
    return Date.now() < this.rateLimitedUntil;
  }

  getRateLimitStatus(): EbayRateLimitStatus {
    const now = Date.now();
    const basicStatus: EbayRateLimitStatus = {
      isLimited: now < this.rateLimitedUntil,
      retryAfterMs: Math.max(0, this.rateLimitedUntil - now),
      consecutiveHits: this.consecutiveRateLimits,
    };

    // Merge with cached API data if available and fresh
    if (this.cachedRateLimits && (now - this.rateLimitsCacheTime < this.RATE_LIMITS_CACHE_MS)) {
      return {
        ...basicStatus,
        remaining: this.cachedRateLimits.remaining,
        limit: this.cachedRateLimits.limit,
        count: this.cachedRateLimits.count,
        resetAt: this.cachedRateLimits.resetAt,
        timeWindowSeconds: this.cachedRateLimits.timeWindowSeconds,
      };
    }

    return basicStatus;
  }

  /**
   * Fetch actual rate limit data from eBay Analytics API
   */
  async fetchRateLimits(): Promise<EbayRateLimitStatus> {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('No access token available');
      }

      const response = await axios.get<EbayRateLimitsResponse>(
        `${EBAY_API_BASE}/developer/analytics/v1_beta/rate_limit/`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          params: {
            api_name: 'browse',
            api_context: 'buy',
          },
        }
      );

      // Find the browse API rate limits (note: eBay returns "Browse" with capital B)
      const browseApi = response.data.rateLimits?.find(
        rl => rl.apiName?.toLowerCase() === 'browse' && rl.apiContext === 'buy'
      );

      // Look for buy.browse resource (the main Browse API endpoint)
      const searchResource = browseApi?.resources?.find(r => r.name === 'buy.browse');
      const rate = searchResource?.rates?.[0];

      const now = Date.now();
      let retryAfterMs = 0;

      // Calculate time until reset
      if (rate?.reset) {
        const resetTime = new Date(rate.reset).getTime();
        retryAfterMs = Math.max(0, resetTime - now);
      }

      // Check if we're at the limit
      const isLimited = rate?.remaining !== undefined && rate.remaining <= 0;

      // Update local rate limit tracking if API says we're limited
      if (isLimited && rate?.reset) {
        this.rateLimitedUntil = new Date(rate.reset).getTime();
      }

      const status: EbayRateLimitStatus = {
        isLimited,
        retryAfterMs,
        consecutiveHits: this.consecutiveRateLimits,
        remaining: rate?.remaining,
        limit: rate?.limit,
        count: rate?.count,
        resetAt: rate?.reset,
        timeWindowSeconds: rate?.timeWindow,
      };

      // Cache the result
      this.cachedRateLimits = status;
      this.rateLimitsCacheTime = now;

      logger.debug('EBAY_RATE_LIMITS_FETCHED', {
        remaining: rate?.remaining,
        limit: rate?.limit,
        count: rate?.count,
        resetAt: rate?.reset,
        isLimited,
      });

      return status;
    } catch (error) {
      logger.warn('EBAY_RATE_LIMITS_FETCH_FAILED', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return basic status on error
      return this.getRateLimitStatus();
    }
  }

  private handleRateLimit(): void {
    this.consecutiveRateLimits++;
    // Exponential backoff: 1min, 2min, 4min, capped at 5min
    this.rateLimitBackoff = Math.min(
      RATE_LIMIT_BACKOFF_MS * Math.pow(2, this.consecutiveRateLimits - 1),
      RATE_LIMIT_MAX_BACKOFF_MS
    );
    this.rateLimitedUntil = Date.now() + this.rateLimitBackoff;

    logger.warn('EBAY_RATE_LIMITED', {
      backoffMs: this.rateLimitBackoff,
      retryAt: new Date(this.rateLimitedUntil).toISOString(),
      consecutiveHits: this.consecutiveRateLimits,
    });
  }

  private resetRateLimit(): void {
    if (this.consecutiveRateLimits > 0) {
      logger.info('EBAY_RATE_LIMIT_RESET', {
        previousConsecutiveHits: this.consecutiveRateLimits,
      });
    }
    this.consecutiveRateLimits = 0;
    this.rateLimitBackoff = RATE_LIMIT_BACKOFF_MS;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Get authenticated headers
  // ───────────────────────────────────────────────────────────────────────────

  private async getHeaders(): Promise<Record<string, string>> {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      throw new Error('Failed to obtain eBay access token');
    }
    
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB',
      'X-EBAY-C-ENDUSERCTX': 'affiliateCampaignId=<CAMPAIGN_ID>,affiliateReferenceId=<REF_ID>',
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Search for listings (main method used by codebase)
  // ───────────────────────────────────────────────────────────────────────────

  async searchListings(params: EbaySearchParams): Promise<EbaySearchResult> {
    // Check if we're rate limited before making the call
    if (this.isRateLimited()) {
      const status = this.getRateLimitStatus();
      logger.debug('EBAY_SEARCH_SKIPPED_RATE_LIMITED', {
        query: params.query || params.q,
        retryAfterMs: status.retryAfterMs,
      });
      return {
        listings: [],
        total: 0,
        offset: 0,
        hasMore: false,
        rateLimited: true,
      };
    }

    try {
      const headers = await this.getHeaders();

      // Build query parameters
      const queryParams: Record<string, string | number> = {
        q: params.query || params.q || '',
        category_ids: params.categoryIds || POKEMON_CATEGORY_ID,
        limit: params.limit || 50,
        offset: params.offset || 0,
      };

      // Add sort order
      if (params.sortOrder) {
        queryParams.sort = sortMap[params.sortOrder] || 'newlyListed';
      } else if (params.sort) {
        queryParams.sort = params.sort;
      } else {
        queryParams.sort = 'newlyListed';
      }

      // Add filter - default to UK Buy It Now if not specified
      // This ensures we only get UK sellers unless explicitly overridden
      queryParams.filter = params.filter || 'buyingOptions:{FIXED_PRICE},itemLocationCountry:GB';

      // Add fieldgroups for additional data
      // EXTENDED: item specifics (localizedAspects)
      // PRODUCT: conditionDescriptors for accurate card condition mapping
      queryParams.fieldgroups = params.fieldgroups || 'EXTENDED,PRODUCT';

      const response = await axios.get<EbayBrowseApiResponse>(
        `${this.baseUrl}/item_summary/search`,
        {
          headers,
          params: queryParams,
        }
      );

      const items = response.data.itemSummaries || [];
      const total = response.data.total || 0;
      const currentOffset = response.data.offset || 0;
      const limit = response.data.limit || 50;

      // Normalize listings
      const listings = items.map(item => this.normalizeItem(item));

      // Success - reset rate limit tracking
      this.resetRateLimit();

      return {
        listings,
        total,
        offset: currentOffset,
        hasMore: currentOffset + listings.length < total,
        nextOffset: currentOffset + limit,
      };
    } catch (error) {
      const queryUsed = params.query || params.q || 'unknown';
      const axiosError = error as { response?: { status: number } };

      // Check for rate limit (429)
      if (axiosError.response?.status === 429) {
        this.handleRateLimit();
        return {
          listings: [],
          total: 0,
          offset: 0,
          hasMore: false,
          rateLimited: true,
        };
      }

      logger.error({
        event: 'EBAY_SEARCH_FAILED',
        query: queryUsed,
        error: error instanceof Error ? error.message : 'Unknown',
        status: axiosError.response?.status,
      });

      // Return empty result on error
      return {
        listings: [],
        total: 0,
        offset: 0,
        hasMore: false,
      };
    }
  }

  // Alias for searchListings
  async search(params: EbaySearchParams): Promise<EbaySearchResult> {
    return this.searchListings(params);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Normalize eBay API item to our EbayListing interface
  // ───────────────────────────────────────────────────────────────────────────

  private normalizeItem(item: EbayBrowseApiItem): EbayListing {
    // Parse price
    const priceValue = item.price?.value ? parseFloat(item.price.value) : 0;
    const priceCurrency = item.price?.currency || 'GBP';

    // Parse shipping cost
    let shippingCost = 0;
    if (item.shippingOptions && item.shippingOptions.length > 0) {
      const firstOption = item.shippingOptions[0];
      if (firstOption.shippingCost?.value) {
        shippingCost = parseFloat(firstOption.shippingCost.value) || 0;
      }
    }

    // Calculate total cost
    const totalCost = priceValue + shippingCost;

    // Build location string
    let locationString = '';
    if (item.itemLocation) {
      const parts: string[] = [];
      if (item.itemLocation.city) parts.push(item.itemLocation.city);
      if (item.itemLocation.stateOrProvince) parts.push(item.itemLocation.stateOrProvince);
      if (item.itemLocation.country) {
        const countryNames: Record<string, string> = {
          'GB': 'United Kingdom',
          'US': 'United States',
          'DE': 'Germany',
          'FR': 'France',
          'IT': 'Italy',
          'ES': 'Spain',
          'NL': 'Netherlands',
          'JP': 'Japan',
          'CN': 'China',
          'AU': 'Australia',
          'CA': 'Canada',
        };
        parts.push(countryNames[item.itemLocation.country] || item.itemLocation.country);
      }
      locationString = parts.join(', ');
    }

    // Parse seller feedback percentage
    let feedbackPercentage: number | undefined;
    if (item.seller?.feedbackPercentage) {
      const parsed = parseFloat(String(item.seller.feedbackPercentage));
      if (!isNaN(parsed)) {
        feedbackPercentage = parsed;
      }
    }

    return {
      itemId: item.itemId || '',
      legacyItemId: item.legacyItemId,
      
      title: item.title || '',
      shortDescription: item.shortDescription,
      
      price: priceValue,
      priceCurrency,
      shippingCost,
      totalCost,
      freeShipping: shippingCost === 0,
      
      url: item.itemWebUrl || `https://www.ebay.co.uk/itm/${item.itemId}`,
      imageUrl: item.image?.imageUrl || null,
      additionalImages: item.additionalImages?.map((img: EbayImage) => img.imageUrl).filter(Boolean) as string[] | undefined,
      
      seller: {
        username: item.seller?.username || 'Unknown',
        feedbackScore: item.seller?.feedbackScore || 0,
        feedbackPercentage,
      },
      
      location: locationString,
      country: item.itemLocation?.country,
      
      condition: item.condition,
      conditionId: item.conditionId,
      categoryId: item.categoryId,
      categoryPath: item.categoryPath,

      buyingOptions: item.buyingOptions,
      isBuyItNow: item.buyingOptions?.includes('FIXED_PRICE') || false,
      isAuction: item.buyingOptions?.includes('AUCTION') || false,

      listingTime: item.itemCreationDate || new Date().toISOString(),
      endTime: item.itemEndDate,

      shippingOptions: item.shippingOptions,

      // Extract card condition from item specifics or title
      ...this.extractCardCondition(item),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Extract card condition from item specifics and title
  // ───────────────────────────────────────────────────────────────────────────

  private extractCardCondition(item: EbayBrowseApiItem): {
    cardCondition?: string;
    mappedCondition?: 'NM' | 'LP' | 'MP' | 'HP';
    conditionSource?: 'condition_descriptor' | 'item_specifics' | 'title' | 'default';
    conditionBlocked?: boolean;
    conditionDescriptorId?: string;
    rawConditionDescriptors?: Array<{ name: string; values: Array<{ value?: string; content?: string }> }>;
    itemSpecifics?: Record<string, string>;
  } {
    // Build item specifics from localizedAspects
    const itemSpecifics: Record<string, string> = {};
    if (item.localizedAspects) {
      for (const aspect of item.localizedAspects) {
        itemSpecifics[aspect.name] = aspect.value;
      }
    }

    // Get condition using the mapper
    // Priority: conditionDescriptors (eBay ID) → localizedAspects → title → default
    const conditionResult = getListingCondition({
      conditionDescriptors: item.conditionDescriptors,
      localizedAspects: item.localizedAspects,
      title: item.title,
      logItemId: item.itemId,
    });

    return {
      cardCondition: conditionResult.rawValue,
      mappedCondition: conditionResult.condition,
      conditionSource: conditionResult.source,
      conditionBlocked: conditionResult.blocked,
      conditionDescriptorId: conditionResult.descriptorId,
      rawConditionDescriptors: item.conditionDescriptors, // Include raw for debugging
      itemSpecifics: Object.keys(itemSpecifics).length > 0 ? itemSpecifics : undefined,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Search for Pokemon cards specifically
  // ───────────────────────────────────────────────────────────────────────────

  async searchPokemonCards(query: string, options: Partial<EbaySearchParams> = {}): Promise<EbaySearchResult> {
    return this.searchListings({
      query,
      categoryIds: POKEMON_CATEGORY_ID,
      sortOrder: 'newlyListed',
      limit: 50,
      ...options,
      // Default filter for Buy It Now listings in UK
      filter: options.filter || 'buyingOptions:{FIXED_PRICE},itemLocationCountry:GB',
      // EXTENDED + PRODUCT to get item specifics AND conditionDescriptors
      fieldgroups: options.fieldgroups || 'EXTENDED,PRODUCT',
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Get a single item by ID
  // ───────────────────────────────────────────────────────────────────────────

  async getItem(itemId: string): Promise<EbayListing | null> {
    try {
      const headers = await this.getHeaders();

      // Request PRODUCT fieldgroup to get conditionDescriptors for ungraded cards
      // This is required to get the CCG-specific condition codes (400010, 400015, 400016, 400017)
      const response = await axios.get<EbayBrowseApiItem>(
        `${this.baseUrl}/item/${itemId}`,
        {
          headers,
          params: {
            fieldgroups: 'PRODUCT',
          },
        }
      );

      // Log raw conditionDescriptors for debugging
      if (response.data.conditionDescriptors) {
        logger.debug('RAW_CONDITION_DESCRIPTORS', {
          itemId,
          conditionId: response.data.conditionId,
          descriptors: response.data.conditionDescriptors,
        });
      }

      return this.normalizeItem(response.data);
    } catch (error) {
      logger.error({
        event: 'EBAY_GET_ITEM_FAILED',
        itemId,
        error: error instanceof Error ? error.message : 'Unknown'
      });
      return null;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Enrich listing with full item details (including conditionDescriptors)
  // Call this when conditionSource is 'default' or 'title' to try to get
  // a more reliable source (condition_descriptor > item_specifics > title > default)
  // ───────────────────────────────────────────────────────────────────────────

  async enrichListingWithCondition(listing: EbayListing): Promise<EbayListing> {
    // Source priority: condition_descriptor (1) > item_specifics (2) > title (3) > default (4)
    const sourcePriority: Record<string, number> = {
      'condition_descriptor': 1,
      'item_specifics': 2,
      'title': 3,
      'default': 4,
    };

    const currentPriority = sourcePriority[listing.conditionSource || 'default'] || 4;

    // Only enrich if we might get a better source (currently title or default)
    if (currentPriority <= 2) {
      return listing; // Already have reliable source
    }

    try {
      const fullListing = await this.getItem(listing.itemId);
      if (!fullListing) {
        return listing;
      }

      const newPriority = sourcePriority[fullListing.conditionSource || 'default'] || 4;

      // Only update if new source is more reliable
      if (newPriority < currentPriority) {
        logger.info('CONDITION_ENRICHED', {
          itemId: listing.itemId,
          previousSource: listing.conditionSource,
          newSource: fullListing.conditionSource,
          previousCondition: listing.mappedCondition,
          newCondition: fullListing.mappedCondition,
          descriptorId: fullListing.conditionDescriptorId,
        });

        return {
          ...listing,
          cardCondition: fullListing.cardCondition,
          mappedCondition: fullListing.mappedCondition,
          conditionSource: fullListing.conditionSource,
          conditionDescriptorId: fullListing.conditionDescriptorId,
        };
      }
    } catch (error) {
      logger.debug('CONDITION_ENRICHMENT_FAILED', {
        itemId: listing.itemId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }

    // Return original listing if enrichment failed or didn't improve
    return listing;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Batch enrich listings with condition (parallel with rate limiting)
  // ───────────────────────────────────────────────────────────────────────────

  async enrichListingsWithCondition(
    listings: EbayListing[],
    options: { maxConcurrent?: number } = {}
  ): Promise<EbayListing[]> {
    const { maxConcurrent = 5 } = options;

    // Regex to detect graded cards (don't need raw condition enrichment)
    const gradedRegex = /\b(PSA|CGC|BGS|SGC|TAG|ARS|GMA|HGA|MNT)\s*\d+/i;

    // Filter listings that need enrichment:
    // - 'default': No condition found at all
    // - 'title': Condition parsed from title, but conditionDescriptor might be available
    // We skip 'condition_descriptor' and 'item_specifics' as those are already reliable
    // We also skip graded cards - they don't need raw condition data
    const needsEnrichment = listings.filter(l => {
      // Already have reliable condition
      if (l.conditionSource === 'condition_descriptor' || l.conditionSource === 'item_specifics') {
        return false;
      }
      // Skip graded cards - don't need raw condition
      if (gradedRegex.test(l.title)) {
        return false;
      }
      // Only enrich default or title-parsed conditions
      return l.conditionSource === 'default' || l.conditionSource === 'title';
    });

    const noEnrichmentNeeded = listings.filter(
      l => l.conditionSource === 'condition_descriptor' || l.conditionSource === 'item_specifics'
    );
    const skippedGraded = listings.filter(l => gradedRegex.test(l.title)).length;

    if (needsEnrichment.length === 0) {
      return listings;
    }

    logger.info('ENRICHING_CONDITIONS', {
      total: listings.length,
      needsEnrichment: needsEnrichment.length,
      skippedGraded,
      fromTitle: listings.filter(l => l.conditionSource === 'title').length,
      fromDefault: listings.filter(l => l.conditionSource === 'default').length,
      alreadyReliable: noEnrichmentNeeded.length,
    });

    // Process in batches to avoid overwhelming the API
    const enrichedListings: EbayListing[] = [];

    for (let i = 0; i < needsEnrichment.length; i += maxConcurrent) {
      const batch = needsEnrichment.slice(i, i + maxConcurrent);
      const results = await Promise.all(
        batch.map(listing => this.enrichListingWithCondition(listing))
      );
      enrichedListings.push(...results);
    }

    // Rebuild the listings array maintaining original order
    const enrichedMap = new Map(enrichedListings.map(l => [l.itemId, l]));
    return listings.map(listing =>
      enrichedMap.get(listing.itemId) || listing
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Health check - verify API connectivity
  // ───────────────────────────────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.searchListings({
        query: 'pokemon card',
        limit: 1,
      });
      return result.listings.length >= 0; // Even 0 results is a successful API call
    } catch {
      return false;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export singleton instance
// ─────────────────────────────────────────────────────────────────────────────

export const ebayClient = new EbayClient();

// Alias for backward compatibility (index.ts exports 'ebay')
export const ebay = ebayClient;

// Re-export getTokenInfo as getTokenExpiresAt for backward compatibility
export function getTokenExpiresAt(): Date | null {
  const info = getTokenInfo();
  return info.expiresAt;
}

// Also export the class for testing
export { EbayClient };