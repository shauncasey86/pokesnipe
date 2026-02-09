// src/routes/training.ts
// ═══════════════════════════════════════════════════════════════════════════
// Training Routes - API endpoints for parser training corpus
// ═══════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { corpusService } from '../services/training/index.js';
import { titleParser } from '../services/parser/index.js';
import { ebayClient } from '../services/ebay/client.js';
import { logger } from '../utils/logger.js';
import type { CorpusStatus } from '../services/training/types.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/training/stats
// Get corpus statistics
// ─────────────────────────────────────────────────────────────────────────────

router.get('/stats', (_req: Request, res: Response): void => {
  try {
    const stats = corpusService.getStats();
    const analytics = corpusService.getAnalytics();

    res.json({
      status: 'ok',
      corpus: stats,
      analytics,
    });
  } catch (error) {
    logger.error('TRAINING_STATS_ERROR', { error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/training/analytics
// Get detailed parser analytics
// ─────────────────────────────────────────────────────────────────────────────

router.get('/analytics', (_req: Request, res: Response): void => {
  try {
    const analytics = corpusService.getAnalytics();

    // Sort pattern hits by frequency
    const sortedPatterns = Object.entries(analytics.patternHits)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);

    // Sort skip reasons by frequency
    const sortedSkipReasons = Object.entries(analytics.skipReasons)
      .sort((a, b) => b[1] - a[1]);

    res.json({
      status: 'ok',
      analytics: {
        ...analytics,
        topPatterns: sortedPatterns,
        skipReasons: sortedSkipReasons,
      },
    });
  } catch (error) {
    logger.error('TRAINING_ANALYTICS_ERROR', { error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/training/pending
// Get pending corpus entries for review
// ─────────────────────────────────────────────────────────────────────────────

router.get('/pending', (req: Request, res: Response): void => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const pending = corpusService.getPending(limit);

    res.json({
      status: 'ok',
      count: pending.length,
      entries: pending,
    });
  } catch (error) {
    logger.error('TRAINING_PENDING_ERROR', { error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/training/entry/:id
// Get a specific corpus entry
// ─────────────────────────────────────────────────────────────────────────────

router.get('/entry/:id', (req: Request, res: Response): void => {
  try {
    const entry = corpusService.getEntry(req.params.id);

    if (!entry) {
      res.status(404).json({
        status: 'error',
        message: 'Entry not found',
      });
      return;
    }

    res.json({
      status: 'ok',
      entry,
    });
  } catch (error) {
    logger.error('TRAINING_ENTRY_ERROR', { error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/training/review/:id
// Review a corpus entry (mark as verified/incorrect/skipped)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/review/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const { status, notes, expected } = req.body;

    // Validate status
    const validStatuses: CorpusStatus[] = ['verified', 'incorrect', 'skipped'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid status. Must be: verified, incorrect, or skipped',
      });
      return;
    }

    const success = corpusService.review(id, status, notes, expected);

    if (!success) {
      res.status(404).json({
        status: 'error',
        message: 'Entry not found',
      });
      return;
    }

    res.json({
      status: 'ok',
      message: `Entry marked as ${status}`,
    });
  } catch (error) {
    logger.error('TRAINING_REVIEW_ERROR', { error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/training/feedback
// Submit user feedback for wrong match
// ─────────────────────────────────────────────────────────────────────────────

router.post('/feedback', (req: Request, res: Response): void => {
  try {
    const {
      dealId,
      ebayTitle,
      matchedCardName,
      matchedExpansion,
      matchedCardNumber,
      confidence,
      feedbackType,
      wrongMatchReason,
      notes,
    } = req.body;

    // Validate required fields
    if (!dealId || !ebayTitle || !matchedCardName) {
      res.status(400).json({
        status: 'error',
        message: 'Missing required fields: dealId, ebayTitle, matchedCardName',
      });
      return;
    }

    const feedbackId = corpusService.addFeedback({
      dealId,
      ebayTitle,
      matchedCardName,
      matchedExpansion: matchedExpansion || '',
      matchedCardNumber: matchedCardNumber || '',
      confidence: confidence || 0,
      feedbackType: feedbackType || 'wrong_match',
      wrongMatchReason,
      notes,
    });

    res.json({
      status: 'ok',
      message: 'Feedback recorded',
      feedbackId,
    });
  } catch (error) {
    logger.error('TRAINING_FEEDBACK_ERROR', { error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/training/feedback
// Get recent user feedback
// ─────────────────────────────────────────────────────────────────────────────

router.get('/feedback', (req: Request, res: Response): void => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const feedback = corpusService.getFeedback(limit);

    res.json({
      status: 'ok',
      count: feedback.length,
      feedback,
    });
  } catch (error) {
    logger.error('TRAINING_FEEDBACK_LIST_ERROR', { error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/training/test
// Run parser tests against verified corpus
// ─────────────────────────────────────────────────────────────────────────────

router.post('/test', (_req: Request, res: Response): void => {
  try {
    const results = corpusService.runTests();

    res.json({
      status: 'ok',
      results,
    });
  } catch (error) {
    logger.error('TRAINING_TEST_ERROR', { error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/training/parse
// Test parser on a single title (for debugging)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/parse', (req: Request, res: Response): void => {
  try {
    const { title } = req.body;

    if (!title || typeof title !== 'string') {
      res.status(400).json({
        status: 'error',
        message: 'Title is required',
      });
      return;
    }

    const parsed = titleParser.parse(title);

    res.json({
      status: 'ok',
      parsed,
    });
  } catch (error) {
    logger.error('TRAINING_PARSE_ERROR', { error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/training/export
// Export corpus as JSON
// ─────────────────────────────────────────────────────────────────────────────

router.get('/export', (_req: Request, res: Response): void => {
  try {
    const data = corpusService.export();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="corpus-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(data);
  } catch (error) {
    logger.error('TRAINING_EXPORT_ERROR', { error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/training/import
// Import corpus from JSON
// ─────────────────────────────────────────────────────────────────────────────

router.post('/import', (req: Request, res: Response): void => {
  try {
    const data = req.body;

    if (!data || !Array.isArray(data.corpus)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid import data. Expected { corpus: [...] }',
      });
      return;
    }

    corpusService.import(data);
    const stats = corpusService.getStats();

    res.json({
      status: 'ok',
      message: 'Corpus imported',
      stats,
    });
  } catch (error) {
    logger.error('TRAINING_IMPORT_ERROR', { error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/training/report
// Generate report for Claude to improve the parser
// ─────────────────────────────────────────────────────────────────────────────

router.get('/report', (_req: Request, res: Response): void => {
  try {
    const report = corpusService.generateReport();

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(report);
  } catch (error) {
    logger.error('TRAINING_REPORT_ERROR', { error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/training/clear
// Clear corpus to start fresh training batch (after reviewing report)
// Options:
//   keepVerified: boolean - Keep verified entries for regression testing
//   clearFeedback: boolean - Also clear user feedback (default: true)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/clear', (req: Request, res: Response): void => {
  try {
    const { keepVerified = false, clearFeedback = true } = req.body || {};

    const result = corpusService.clear({ keepVerified, clearFeedback });

    res.json({
      status: 'ok',
      message: 'Corpus cleared - ready for next training batch',
      ...result,
    });
  } catch (error) {
    logger.error('TRAINING_CLEAR_ERROR', { error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/training/ebay-listing
// Fetch eBay listing and run parser on it
// ─────────────────────────────────────────────────────────────────────────────

router.post('/ebay-listing', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, itemId: providedItemId } = req.body;

    if (!url && !providedItemId) {
      res.status(400).json({
        status: 'error',
        message: 'Either url or itemId is required',
      });
      return;
    }

    // Extract item ID from URL if provided
    let itemId = providedItemId;
    if (url && !itemId) {
      // Support various eBay URL formats:
      // https://www.ebay.co.uk/itm/123456789
      // https://www.ebay.co.uk/itm/title-here/123456789
      // https://www.ebay.com/itm/123456789?hash=item...
      // v1|123456789|0 (API format)
      const patterns = [
        /\/itm\/(?:[^/]+\/)?(\d+)/,           // /itm/123 or /itm/title/123
        /\/itm\/(\d+)/,                        // /itm/123
        /[?&]item=(\d+)/,                      // ?item=123
        /^v\d+\|(\d+)\|/,                      // v1|123|0
        /^(\d{10,15})$/,                       // Just the ID (10-15 digits)
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          itemId = match[1];
          break;
        }
      }

      if (!itemId) {
        res.status(400).json({
          status: 'error',
          message: 'Could not extract item ID from URL. Try pasting just the item ID.',
        });
        return;
      }
    }

    // Format item ID for eBay API (needs v1|itemId|0 format)
    const apiItemId = itemId.startsWith('v') ? itemId : `v1|${itemId}|0`;

    logger.info('EBAY_LISTING_TEST', { itemId, apiItemId, url: url?.substring(0, 50) });

    // Fetch listing from eBay API
    const listing = await ebayClient.getItem(apiItemId);

    if (!listing) {
      res.status(404).json({
        status: 'error',
        message: `Could not fetch listing. Item ID: ${itemId}`,
      });
      return;
    }

    // Run parser on the title
    const parsed = titleParser.parse(listing.title);

    // Get raw API response to show conditionDescriptors for debugging
    const rawApiItemId = itemId.startsWith('v') ? itemId : `v1|${itemId}|0`;

    res.json({
      status: 'ok',
      listing: {
        itemId: listing.itemId,
        legacyItemId: listing.legacyItemId || itemId,
        title: listing.title,
        price: listing.price,
        priceCurrency: listing.priceCurrency,
        shippingCost: listing.shippingCost,
        totalCost: listing.totalCost,
        url: listing.url,
        imageUrl: listing.imageUrl,
        condition: listing.condition,
        conditionId: listing.conditionId,
        cardCondition: listing.cardCondition,
        mappedCondition: listing.mappedCondition,
        conditionSource: listing.conditionSource,
        conditionDescriptorId: listing.conditionDescriptorId,
        rawConditionDescriptors: listing.rawConditionDescriptors, // Show what eBay returned
        seller: listing.seller,
        location: listing.location,
        country: listing.country,
        listingTime: listing.listingTime,
        itemSpecifics: listing.itemSpecifics,
      },
      parsed,
      _debug: {
        apiItemId: rawApiItemId,
        note: 'If conditionDescriptors is empty, the seller did not set a card condition',
      },
    });
  } catch (error) {
    logger.error('EBAY_LISTING_TEST_ERROR', { error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/training/set-match-failures
// Get set match failures for analysis and improvement
// Query params:
//   limit: number (default 100)
//   includeResolved: boolean (default false)
//   minHitCount: number (default 1)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/set-match-failures', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const includeResolved = req.query.includeResolved === 'true';
    const minHitCount = parseInt(req.query.minHitCount as string) || 1;

    const failures = await corpusService.getSetMatchFailures({
      limit,
      includeResolved,
      minHitCount,
    });

    // Calculate summary stats
    const totalHits = failures.reduce((sum, f) => sum + f.hitCount, 0);
    const uniqueSetNames = new Set(failures.map(f => f.parsedSetName)).size;

    res.json({
      status: 'ok',
      count: failures.length,
      totalHits,
      uniqueSetNames,
      failures,
    });
  } catch (error) {
    logger.error('SET_MATCH_FAILURES_ERROR', { error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/training/set-match-failures/:id/resolve
// Mark a set match failure as resolved (after adding an alias)
// Body: { expansionId: string, notes?: string }
// ─────────────────────────────────────────────────────────────────────────────

router.post('/set-match-failures/:id/resolve', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { expansionId, notes } = req.body || {};

    if (!expansionId) {
      res.status(400).json({
        status: 'error',
        message: 'expansionId is required',
      });
      return;
    }

    const success = await corpusService.resolveSetMatchFailure(id, expansionId, notes);

    if (success) {
      res.json({
        status: 'ok',
        message: 'Set match failure marked as resolved',
      });
    } else {
      res.status(404).json({
        status: 'error',
        message: 'Set match failure not found',
      });
    }
  } catch (error) {
    logger.error('SET_MATCH_FAILURE_RESOLVE_ERROR', { error });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
