// src/services/scrydex/client.ts

import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { MemoryCache } from '../cache/index.js';
import type {
  ScrydexCard,
  ScrydexExpansion,
  ScrydexPrice,
  ScrydexPaginatedResponse,
  ScrydexSingleResponse,
  ScrydexUsageResponse,
  CardSearchParams,
  ExpansionSearchParams,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// TIERED CACHE TTLs - Based on card type volatility
// Graded/Vintage cards are very stable, new releases are volatile
// ═══════════════════════════════════════════════════════════════════════════
const CACHE_TTL = {
  CARD: 3600,                    // 1 hour (no prices)
  CARD_WITH_PRICES: 86400,       // 24 hours (with prices)
  EXPANSION: 86400,              // 24 hours
  // Tiered pricing TTLs based on volatility
  GRADED_VINTAGE: 604800,        // 7 days - PSA/CGC/BGS cards, WOTC-era sets
  MODERN_STABLE: 259200,         // 72 hours - sets > 2 months old
  RECENT_SETS: 172800,           // 48 hours - sets < 8 weeks old
  USAGE: 3600,                   // 1 hour - API usage stats (24 calls/day max)
} as const;

// WOTC-era set prefixes (Base Set through Skyridge, 1999-2003)
const VINTAGE_SET_PREFIXES = [
  'base', 'jungle', 'fossil', 'bs2', 'tr', 'gym1', 'gym2',
  'neo1', 'neo2', 'neo3', 'neo4', 'si', 'lc', 'ecard1', 'ecard2', 'ecard3',
  'mcd', 'wizpro', // Promos
];

// Grading companies for detecting graded card queries
const GRADING_COMPANIES = ['PSA', 'CGC', 'BGS', 'SGC', 'TAG', 'ARS', 'GMA', 'HGA', 'MNT', 'ACE'];

export class ScrydexClient {
  private readonly http: AxiosInstance;
  private readonly cache: MemoryCache;

  // Expansion release dates cache (loaded lazily)
  private expansionReleaseDates: Map<string, Date> = new Map();

  constructor() {
    this.cache = new MemoryCache(CACHE_TTL.CARD);

    this.http = axios.create({
      baseURL: config.scrydex.baseUrl,
      timeout: 30000,
      headers: {
        'X-Api-Key': config.scrydex.apiKey,
        'X-Team-ID': config.scrydex.teamId,
        'Content-Type': 'application/json',
      },
    });

    this.http.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => this.handleError(error)
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Tiered TTL Calculation - Determines cache duration based on card volatility
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Calculate the appropriate cache TTL based on expansion and query type
   * @param expansionId - The expansion ID (e.g., 'swsh1', 'base1')
   * @param query - The search query (to detect graded cards)
   * @returns TTL in seconds
   */
  private calculateTieredTTL(expansionId?: string, query?: string): number {
    // Check if this is a graded card query (PSA, CGC, BGS, etc.)
    const isGradedQuery = query && GRADING_COMPANIES.some(
      company => query.toUpperCase().includes(company)
    );

    // Check if this is a vintage/WOTC-era set
    const isVintageSet = expansionId && VINTAGE_SET_PREFIXES.some(
      prefix => expansionId.toLowerCase().startsWith(prefix)
    );

    // Graded cards and vintage sets get longest TTL (7 days)
    if (isGradedQuery || isVintageSet) {
      return CACHE_TTL.GRADED_VINTAGE;
    }

    // Check expansion release date if we have it cached
    if (expansionId) {
      const releaseDate = this.expansionReleaseDates.get(expansionId.toLowerCase());
      if (releaseDate) {
        const now = new Date();
        const ageInDays = (now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24);

        // Sets > 60 days old: 72 hours
        if (ageInDays > 60) {
          return CACHE_TTL.MODERN_STABLE;
        }

        // Sets < 60 days old: 48 hours
        return CACHE_TTL.RECENT_SETS;
      }
    }

    // Default to 48 hours for unknown sets (conservative for new releases)
    return CACHE_TTL.RECENT_SETS;
  }

  /**
   * Extract expansion ID from a search query
   * e.g., "expansion.id:swsh1 number:1" -> "swsh1"
   */
  private extractExpansionFromQuery(query?: string): string | undefined {
    if (!query) return undefined;
    const match = query.match(/expansion\.id:(\S+)/i);
    return match?.[1];
  }

  /**
   * Register expansion release dates for TTL calculation
   * Called by expansion service after loading expansions
   */
  registerExpansionReleaseDates(expansions: Array<{ id: string; releaseDate?: string }>): void {
    for (const exp of expansions) {
      if (exp.releaseDate) {
        const date = this.parseReleaseDate(exp.releaseDate);
        if (date) {
          this.expansionReleaseDates.set(exp.id.toLowerCase(), date);
        }
      }
    }
    logger.debug({
      event: 'EXPANSION_RELEASE_DATES_REGISTERED',
      count: this.expansionReleaseDates.size,
    });
  }

  private parseReleaseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    // Handle YYYY/MM/DD format from Scrydex
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [year, month, day] = parts.map(Number);
      return new Date(year, month - 1, day);
    }

    // Try standard date parse as fallback
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  async getCard(id: string, includePrices: boolean = false): Promise<ScrydexCard | null> {
    const cacheKey = `card:${id}:${includePrices}`;
    const cached = this.cache.get<ScrydexCard>(cacheKey);

    if (cached) {
      logger.debug({ event: 'CACHE_HIT', key: cacheKey });
      return cached;
    }

    try {
      const params: Record<string, string> = {};
      if (includePrices) params.include = 'prices';

      const response = await this.http.get<ScrydexSingleResponse<ScrydexCard>>(
        `/pokemon/v1/cards/${id}`,
        { params }
      );

      const card = response.data.data;
      const ttl = includePrices ? CACHE_TTL.CARD_WITH_PRICES : CACHE_TTL.CARD;
      this.cache.set(cacheKey, card, ttl);

      return card;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async searchCards(params: CardSearchParams): Promise<ScrydexPaginatedResponse<ScrydexCard>> {
    // Generate cache key from params
    const cacheKey = `cards:${JSON.stringify(params)}`;
    const cached = this.cache.get<ScrydexPaginatedResponse<ScrydexCard>>(cacheKey);

    if (cached) {
      logger.debug({ event: 'CACHE_HIT', key: cacheKey, type: 'searchCards' });
      return cached;
    }

    const queryParams: Record<string, string | number> = {
      page: params.page || 1,
      pageSize: params.pageSize || 100,
    };

    if (params.q) queryParams.q = params.q;
    if (params.select) queryParams.select = params.select;
    if (params.include) queryParams.include = params.include;
    if (params.orderBy) queryParams.orderBy = params.orderBy;

    const response = await this.http.get<ScrydexPaginatedResponse<ScrydexCard>>(
      '/pokemon/v1/cards',
      { params: queryParams }
    );

    // Calculate tiered TTL based on expansion and query type
    const expansionId = this.extractExpansionFromQuery(params.q);
    const ttl = this.calculateTieredTTL(expansionId, params.q);

    this.cache.set(cacheKey, response.data, ttl);
    logger.debug({
      event: 'CACHE_SET',
      key: cacheKey,
      type: 'searchCards',
      ttlSeconds: ttl,
      ttlHours: (ttl / 3600).toFixed(1),
      expansionId,
    });

    return response.data;
  }

  async searchByName(
    name: string,
    options: { includePrices?: boolean; pageSize?: number } = {}
  ): Promise<ScrydexPaginatedResponse<ScrydexCard>> {
    const params: CardSearchParams = {
      q: `name:${name}`,
      pageSize: options.pageSize || 100,
    };

    if (options.includePrices) {
      params.include = 'prices';
    }

    return this.searchCards(params);
  }

  async searchExpansions(
    params: ExpansionSearchParams = {}
  ): Promise<ScrydexPaginatedResponse<ScrydexExpansion>> {
    const cacheKey = `expansions:${JSON.stringify(params)}`;
    const cached = this.cache.get<ScrydexPaginatedResponse<ScrydexExpansion>>(cacheKey);

    if (cached) {
      logger.debug({ event: 'CACHE_HIT', key: cacheKey });
      return cached;
    }

    const queryParams: Record<string, string | number> = {
      page: params.page || 1,
      pageSize: params.pageSize || 100,
    };

    if (params.q) queryParams.q = params.q;
    if (params.select) queryParams.select = params.select;
    if (params.orderBy) queryParams.orderBy = params.orderBy;

    const response = await this.http.get<ScrydexPaginatedResponse<ScrydexExpansion>>(
      '/pokemon/v1/expansions',
      { params: queryParams }
    );

    this.cache.set(cacheKey, response.data, CACHE_TTL.EXPANSION);
    return response.data;
  }

  async getAllEnglishExpansions(): Promise<ScrydexExpansion[]> {
    const allExpansions: ScrydexExpansion[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await this.searchExpansions({
        q: 'language:English',
        page,
        pageSize: 100,
      });

      allExpansions.push(...result.data);
      hasMore = result.data.length === 100;
      page++;
    }

    return allExpansions;
  }

  async getCardsFromExpansion(
    expansionId: string,
    options: { page?: number; pageSize?: number; includePrices?: boolean } = {}
  ): Promise<ScrydexPaginatedResponse<ScrydexCard>> {
    const params: CardSearchParams = {
      q: `expansion.id:${expansionId}`,
      page: options.page || 1,
      pageSize: options.pageSize || 100,
    };

    if (options.includePrices) {
      params.include = 'prices';
    }

    return this.searchCards(params);
  }

  /**
   * Search cards within a specific expansion using the expansion-scoped endpoint
   * This is more reliable than using expansion.id: in the query
   * Endpoint: GET /pokemon/v1/expansions/{id}/cards
   */
  async searchCardsInExpansion(
    expansionId: string,
    options: {
      q?: string;
      page?: number;
      pageSize?: number;
      include?: string;
      orderBy?: string;
    } = {}
  ): Promise<ScrydexPaginatedResponse<ScrydexCard>> {
    // Generate cache key from expansion ID and options
    const cacheKey = `expansion-cards:${expansionId}:${JSON.stringify(options)}`;
    const cached = this.cache.get<ScrydexPaginatedResponse<ScrydexCard>>(cacheKey);

    if (cached) {
      logger.debug({ event: 'CACHE_HIT', key: cacheKey, type: 'searchCardsInExpansion' });
      return cached;
    }

    const queryParams: Record<string, string | number> = {
      page: options.page || 1,
      pageSize: options.pageSize || 100,
    };

    if (options.q) queryParams.q = options.q;
    if (options.include) queryParams.include = options.include;
    if (options.orderBy) queryParams.orderBy = options.orderBy;

    const response = await this.http.get<ScrydexPaginatedResponse<ScrydexCard>>(
      `/pokemon/v1/expansions/${expansionId}/cards`,
      { params: queryParams }
    );

    // Calculate tiered TTL based on expansion
    const ttl = this.calculateTieredTTL(expansionId, options.q);

    this.cache.set(cacheKey, response.data, ttl);
    logger.debug({
      event: 'CACHE_SET',
      key: cacheKey,
      type: 'searchCardsInExpansion',
      ttlSeconds: ttl,
      ttlHours: (ttl / 3600).toFixed(1),
      expansionId,
    });

    return response.data;
  }

  /**
   * Search for a card by number within an expansion using the scoped endpoint
   * Supports wildcard patterns (e.g., "TG*", "*15")
   */
  async findCardByNumber(
    expansionId: string,
    cardNumber: string,
    options: { includePrices?: boolean; useWildcard?: boolean } = {}
  ): Promise<ScrydexCard | null> {
    try {
      // Use wildcard if requested (e.g., "TG15" -> "TG*" to find all TG cards)
      let numberQuery = cardNumber;
      if (options.useWildcard) {
        // For TG/GG/SV prefixed numbers, try wildcard on the prefix
        const prefixMatch = cardNumber.match(/^(TG|GG|SV)(\d+)$/i);
        if (prefixMatch) {
          numberQuery = `${prefixMatch[1].toUpperCase()}*`;
        }
      }

      const result = await this.searchCardsInExpansion(expansionId, {
        q: `number:${numberQuery}`,
        include: options.includePrices ? 'prices,images' : 'images',
        pageSize: options.useWildcard ? 50 : 1,
      });

      if (!result.data || result.data.length === 0) {
        return null;
      }

      // If using wildcard, find the exact match
      if (options.useWildcard && result.data.length > 1) {
        const exactMatch = result.data.find(card => {
          const num = card.number?.toString() || '';
          return num.toUpperCase() === cardNumber.toUpperCase() ||
                 num === cardNumber.replace(/^0+/, '');
        });
        return exactMatch || null;
      }

      return result.data[0];
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  extractPrices(card: ScrydexCard): ScrydexPrice[] {
    const prices: ScrydexPrice[] = [];

    for (const variant of card.variants ?? []) {
      for (const price of variant.prices ?? []) {
        prices.push(price);
      }
    }

    return prices;
  }

  extractMarketPrice(card: ScrydexCard, condition: string = 'NM'): number | null {
    const prices = this.extractPrices(card);

    const rawPrice = prices.find(
      (p) => p.type === 'raw' && p.condition === condition
    );

    if (rawPrice?.market) return rawPrice.market;

    const anyRaw = prices.find((p) => p.type === 'raw');
    if (anyRaw?.market) return anyRaw.market;

    return null;
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('Scrydex cache cleared');
  }

  getCacheSize(): number {
    return this.cache.size();
  }

  async getUsage(): Promise<ScrydexUsageResponse | null> {
    // Cache usage stats for 5 minutes to reduce API calls
    const cacheKey = 'usage:account';
    const cached = this.cache.get<ScrydexUsageResponse>(cacheKey);

    if (cached) {
      logger.debug({ event: 'CACHE_HIT', key: cacheKey, type: 'getUsage' });
      return cached;
    }

    try {
      // Account usage endpoint - returns API usage statistics
      logger.debug('Calling Scrydex /account/v1/usage...');
      const response = await this.http.get<ScrydexUsageResponse | { data: ScrydexUsageResponse }>('/account/v1/usage');

      logger.info({ event: 'SCRYDEX_USAGE_RAW_RESPONSE', status: response.status, data: response.data });

      // Handle both wrapped { data: ... } and direct response formats
      const data = response.data;
      let usage: ScrydexUsageResponse;
      if ('data' in data && typeof data.data === 'object') {
        logger.debug('Using wrapped response format');
        usage = data.data as ScrydexUsageResponse;
      } else {
        logger.debug('Using direct response format');
        usage = data as ScrydexUsageResponse;
      }

      // Cache for 1 hour (24 calls/day max)
      this.cache.set(cacheKey, usage, CACHE_TTL.USAGE);
      return usage;
    } catch (error) {
      logger.error('Failed to fetch Scrydex usage:', error);
      return null;
    }
  }

  private handleError(error: AxiosError): never {
    if (error.response) {
      const status = error.response.status;
      const message = (error.response.data as Record<string, unknown>)?.message || error.message;

      switch (status) {
        case 401:
          logger.error('Scrydex API: Invalid API key or Team ID');
          throw new Error('Scrydex authentication failed.');
        case 429:
          logger.warn('Scrydex API: Rate limit exceeded');
          throw new Error('Scrydex rate limit exceeded.');
        case 404:
          throw error;
        default:
          logger.error(`Scrydex API error: ${status} - ${message}`);
          throw new Error(`Scrydex API error: ${message}`);
      }
    }

    if (error.code === 'ECONNABORTED') {
      logger.error('Scrydex API: Request timeout');
      throw new Error('Scrydex API request timed out');
    }

    logger.error(`Scrydex API error: ${error.message}`);
    throw error;
  }
}

export const scrydex = new ScrydexClient();