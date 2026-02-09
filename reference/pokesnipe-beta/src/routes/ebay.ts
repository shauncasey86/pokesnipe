// src/routes/ebay.ts

import { Router, Request, Response } from 'express';
import { ebay, ebayClient } from '../services/ebay/index.js';
import { titleParser } from '../services/parser/index.js';
import { expansionService } from '../services/expansion/index.js';
import { logger } from '../utils/logger.js';
import type { EbayListing } from '../services/ebay/types.js';

const router = Router();

// Types for processed listings
interface ProcessedListing {
  itemId: string;
  title: string;
  priceGbp: number;
  condition: string;
  itemUrl: string;
  seller: string;
  cardName: string | null;
  cardNumber: string | null;
  printedNumber: string | null;
  setName: string | null;
  setCode: string | null;
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  variant: string | null;
  language: string;
  languageCode: string;
  confidence: string;
  confidenceScore: number;
  expansionId: string | null;
  expansionName: string | null;
  matchScore: number;
  matchType: string;
  scrydexQuery: string | null;
  canQuery: boolean;
  warnings: string[];
}

// Promo prefix to expansion ID mapping
const PROMO_PREFIX_TO_EXPANSION: Record<string, string> = {
  'SVP': 'svp',
  'SWSH': 'swshp',
  'SM': 'smp',
  'XY': 'xyp',
  'BW': 'bwp',
  'DP': 'dpp',
  'HGSS': 'hsp',
};

// GET /api/ebay/rate-limits - Get actual rate limit data from eBay Analytics API
router.get('/rate-limits', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rateLimits = await ebayClient.fetchRateLimits();

    res.json({
      status: 'ok',
      rateLimits,
    });
  } catch (error) {
    logger.error('eBay rate limits fetch failed:', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to fetch rate limits',
    });
  }
});

// GET /api/ebay/rate-limits/debug - Debug raw Analytics API response
router.get('/rate-limits/debug', async (_req: Request, res: Response): Promise<void> => {
  try {
    const axios = (await import('axios')).default;
    const { getAccessToken } = await import('../services/ebay/auth.js');

    const token = await getAccessToken();

    // Call Analytics API directly
    const rawResponse = await axios.get(
      'https://api.ebay.com/developer/analytics/v1_beta/rate_limit/',
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        params: {
          api_name: 'browse',
          api_context: 'buy',
        },
      }
    );

    res.json({
      status: 'ok',
      httpStatus: rawResponse.status,
      rawData: rawResponse.data,
    });
  } catch (error: unknown) {
    const axiosError = error as { response?: { status: number; data: unknown }; message?: string };
    logger.error('eBay rate limits debug failed:', { error: axiosError.message || String(error) });

    res.status(500).json({
      status: 'error',
      message: axiosError.message || 'Failed to fetch rate limits',
      httpStatus: axiosError.response?.status,
      apiError: axiosError.response?.data,
    });
  }
});

// GET /api/ebay/status - Lightweight API status check (uses Analytics API for accurate rate limit data)
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    // First, fetch actual rate limit data from Analytics API
    const rateLimits = await ebayClient.fetchRateLimits();

    // If Analytics API says we're rate limited, report that
    if (rateLimits.isLimited) {
      res.json({
        status: 'rate_limited',
        verified: true,
        rateLimits,
        message: `Rate limited - ${rateLimits.remaining ?? 0} calls remaining, resets at ${rateLimits.resetAt || 'unknown'}`,
      });
      return;
    }

    // Get internal rate limit state as fallback
    const internalStatus = ebayClient.getRateLimitStatus();

    // If internal tracking says we're rate limited, respect that
    if (internalStatus.isLimited) {
      res.json({
        status: 'rate_limited',
        verified: false,
        rateLimits,
        retryAfterMs: internalStatus.retryAfterMs,
        message: 'Waiting for rate limit backoff',
      });
      return;
    }

    // Do a minimal API call to verify connection (limit=1)
    const result = await ebay.searchListings({
      query: 'pokemon',
      limit: 1,
    });

    if (result.rateLimited) {
      // Refetch rate limits after hitting a 429
      const updatedLimits = await ebayClient.fetchRateLimits();
      res.json({
        status: 'rate_limited',
        verified: true,
        rateLimits: updatedLimits,
        message: 'Rate limited by eBay API',
      });
    } else if (result.listings.length > 0) {
      res.json({
        status: 'connected',
        verified: true,
        rateLimits,
        listingsFound: result.total,
        message: 'eBay API working',
      });
    } else {
      res.json({
        status: 'connected',
        verified: true,
        rateLimits,
        listingsFound: 0,
        message: 'eBay API connected but no listings found',
      });
    }
  } catch (error) {
    logger.error('eBay status check failed:', { error: error instanceof Error ? error.message : String(error) });
    res.json({
      status: 'error',
      verified: true,
      message: error instanceof Error ? error.message : 'Connection error',
    });
  }
});

// GET /api/ebay/search - Search eBay listings
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, limit } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({
        status: 'error',
        message: 'Query parameter "q" is required',
      });
      return;
    }

    const result = await ebay.searchListings({
      query: q,
      limit: limit ? parseInt(limit as string, 10) : 10,
    });

    res.json({
      status: 'ok',
      data: result,
    });
  } catch (error) {
    logger.error('eBay search failed:', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'eBay search failed',
    });
  }
});

// GET /api/ebay/pipeline - Full pipeline: eBay search + parsing + expansion matching
router.get('/pipeline', async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, limit } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({ status: 'error', message: 'Query parameter "q" is required' });
      return;
    }

    const result = await ebay.searchListings({
      query: q,
      limit: limit ? parseInt(limit as string, 10) : 10,
    });

    const processed: ProcessedListing[] = result.listings.map((listing: EbayListing) => {
      const parsed = titleParser.parse(listing.title);

      // Smart expansion matching - check for promo prefix first
      let expansionMatch = null;
      let promoExpansionId: string | null = null;

      // If we have a printed number like "SM167" or "SWSH180", extract the promo prefix
      if (parsed.printedNumber) {
        const promoMatch = parsed.printedNumber.match(/^(SVP|SWSH|SM|XY|BW|DP|HGSS)(\d+)$/i);
        if (promoMatch) {
          const prefix = promoMatch[1].toUpperCase();
          promoExpansionId = PROMO_PREFIX_TO_EXPANSION[prefix] || null;
        }
      }

      // Use promo expansion if found, otherwise fall back to set name matching
      if (promoExpansionId) {
        const promoExpansion = expansionService.getById(promoExpansionId);
        if (promoExpansion) {
          expansionMatch = {
            success: true,
            match: {
              expansion: promoExpansion,
              matchScore: 100,
              matchType: 'promo_code' as const,
              matchedOn: parsed.printedNumber || '',
            },
            alternates: [],
          };
        }
      } else if (parsed.setName) {
        expansionMatch = expansionService.match(parsed.setName);
      }

      // Build Scrydex query if we have enough info
      let scrydexQuery: string | null = null;
      let canQuery = false;

      if (expansionMatch?.success && expansionMatch.match && parsed.cardNumber) {
        scrydexQuery = `expansion.id:${expansionMatch.match.expansion.id} number:${parsed.cardNumber}`;
        canQuery = true;
      }

      return {
        itemId: listing.itemId,
        title: listing.title,
        priceGbp: listing.totalCost,
        condition: listing.condition || 'Unspecified',
        itemUrl: listing.url,
        seller: listing.seller.username,
        cardName: parsed.cardName,
        cardNumber: parsed.cardNumber,
        printedNumber: parsed.printedNumber,
        setName: parsed.setName,
        setCode: parsed.setCode,
        isGraded: parsed.isGraded,
        gradingCompany: parsed.gradingCompany,
        grade: parsed.grade,
        variant: parsed.variant?.variantName ?? null,
        language: parsed.language,
        languageCode: parsed.languageCode,
        confidence: parsed.confidence,
        confidenceScore: parsed.confidenceScore,
        expansionId: expansionMatch?.match?.expansion.id || null,
        expansionName: expansionMatch?.match?.expansion.name || null,
        matchScore: expansionMatch?.match?.matchScore || 0,
        matchType: expansionMatch?.match?.matchType || 'none',
        scrydexQuery,
        canQuery,
        warnings: parsed.warnings,
      };
    });

    // Calculate stats
    const stats = {
      total: processed.length,
      canQuery: processed.filter((p) => p.canQuery).length,
      byConfidence: {
        PERFECT: processed.filter((p) => p.confidence === 'PERFECT').length,
        HIGH: processed.filter((p) => p.confidence === 'HIGH').length,
        MEDIUM: processed.filter((p) => p.confidence === 'MEDIUM').length,
        LOW: processed.filter((p) => p.confidence === 'LOW').length,
      },
      graded: processed.filter((p) => p.isGraded).length,
      raw: processed.filter((p) => !p.isGraded).length,
    };

    res.json({
      status: 'ok',
      stats,
      data: processed,
    });
  } catch (error) {
    logger.error('Pipeline failed:', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Pipeline failed',
    });
  }
});

// GET /api/ebay/test - Test eBay API connection
router.get('/test', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await ebay.searchListings({
      query: 'charizard psa 10',
      limit: 3,
    });

    res.json({
      status: 'ok',
      message: 'eBay API connection successful',
      data: {
        listingsFound: result.listings.length,
        rateLimited: result.rateLimited || false,
        sample: result.listings.slice(0, 3).map((l: EbayListing) => ({
          title: l.title,
          price: l.totalCost,
        })),
      },
    });
  } catch (error) {
    logger.error('eBay test failed:', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'eBay test failed',
    });
  }
});

// GET /api/ebay/debug - Debug eBay API with raw response data
router.get('/debug', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Make a raw axios call to see the full response
    const axios = (await import('axios')).default;
    const { getAccessToken } = await import('../services/ebay/auth.js');

    const token = await getAccessToken();

    const rawResponse = await axios.get(
      'https://api.ebay.com/buy/browse/v1/item_summary/search',
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB',
        },
        params: {
          q: 'pokemon charizard',
          category_ids: '183454',
          limit: 5,
          filter: 'buyingOptions:{FIXED_PRICE}',
        },
      }
    );

    res.json({
      status: 'ok',
      tokenPresent: !!token,
      tokenPreview: token ? `${token.substring(0, 20)}...` : null,
      httpStatus: rawResponse.status,
      rawData: {
        total: rawResponse.data.total,
        offset: rawResponse.data.offset,
        limit: rawResponse.data.limit,
        itemCount: rawResponse.data.itemSummaries?.length || 0,
        warnings: rawResponse.data.warnings || null,
        hasItems: !!rawResponse.data.itemSummaries,
        firstItem: rawResponse.data.itemSummaries?.[0] ? {
          title: rawResponse.data.itemSummaries[0].title,
          itemId: rawResponse.data.itemSummaries[0].itemId,
        } : null,
      },
    });
  } catch (error: unknown) {
    const axiosError = error as { response?: { status: number; data: unknown; headers?: Record<string, string> }; message?: string };
    logger.error('eBay debug failed:', { error: axiosError.message || String(error) });

    // Log rate limit headers if present
    const headers = axiosError.response?.headers || {};

    res.status(500).json({
      status: 'error',
      message: axiosError.message || 'eBay debug failed',
      httpStatus: axiosError.response?.status,
      apiError: axiosError.response?.data,
      rateLimitHeaders: {
        retryAfter: headers['retry-after'] || null,
        xRateLimitLimit: headers['x-ratelimit-limit'] || null,
        xRateLimitRemaining: headers['x-ratelimit-remaining'] || null,
        xRateLimitReset: headers['x-ratelimit-reset'] || null,
      },
    });
  }
});

export default router;