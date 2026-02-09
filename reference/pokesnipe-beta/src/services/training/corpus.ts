// src/services/training/corpus.ts
// ═══════════════════════════════════════════════════════════════════════════
// Training Corpus Service
// Auto-captures edge cases and manages training data
// ═══════════════════════════════════════════════════════════════════════════

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import type { ParsedTitle } from '../parser/types.js';
import type {
  CorpusEntry,
  CorpusStatus,
  CaptureReason,
  CorpusStats,
  FeedbackEntry,
  ParserAnalytics,
  TestResult,
  TestRunResult,
} from './types.js';
import { titleParser } from '../parser/index.js';
import { query, isConnected } from '../database/postgres.js';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const MAX_CORPUS_SIZE = 2000;        // Max entries to keep
const MAX_PENDING_PER_DAY = 20;      // Cap new pending entries per day
const MAX_FEEDBACK_SIZE = 500;       // Max feedback entries
// Note: DEDUP_SIMILARITY_THRESHOLD could be used for future fuzzy dedup

// ─────────────────────────────────────────────────────────────────────────────
// Corpus Service
// ─────────────────────────────────────────────────────────────────────────────

class CorpusService {
  private corpus: Map<string, CorpusEntry> = new Map();
  private feedback: Map<string, FeedbackEntry> = new Map();
  private todayPendingCount = 0;
  private lastResetDate: string = '';

  // Analytics tracking (in-memory, resets on restart)
  private analytics = {
    confidenceCounts: { perfect: 0, high: 0, medium: 0, low: 0 },
    patternHits: new Map<string, number>(),
    skipReasons: new Map<string, number>(),
    totalProcessed: 0,
    totalMatched: 0,
    totalDeals: 0,
    confidenceSum: 0,
    startTime: new Date().toISOString(),
  };

  // Deduplication: track pattern signatures we've already captured
  private capturedSignatures: Set<string> = new Set();

  private initialized = false;

  constructor() {
    this.resetDailyCounterIfNeeded();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Database Persistence
  // ─────────────────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (isConnected()) {
      await this.loadFromDatabase();
      this.initialized = true;
      logger.info('CORPUS_INITIALIZED', {
        corpusEntries: this.corpus.size,
        feedbackEntries: this.feedback.size,
      });
    } else {
      logger.info('CORPUS_INIT_MEMORY_ONLY', {
        reason: 'No database connection',
      });
    }
  }

  private async loadFromDatabase(): Promise<void> {
    try {
      // Load corpus entries
      const corpusResult = await query<{
        id: string;
        timestamp: Date;
        ebay_title: string;
        ebay_item_id: string | null;
        ebay_price: string | null;
        parsed: ParsedTitle;
        capture_reason: CaptureReason;
        scrydex_matched: boolean;
        scrydex_card_id: string | null;
        scrydex_card_name: string | null;
        expansion_matched: string | null;
        status: CorpusStatus;
        reviewed_at: Date | null;
        review_notes: string | null;
        expected: CorpusEntry['expected'] | null;
      }>(`SELECT * FROM training_corpus ORDER BY timestamp DESC LIMIT $1`, [MAX_CORPUS_SIZE]);

      for (const row of corpusResult.rows) {
        const entry: CorpusEntry = {
          id: row.id,
          timestamp: row.timestamp.toISOString(),
          ebayTitle: row.ebay_title,
          ebayItemId: row.ebay_item_id || undefined,
          ebayPrice: row.ebay_price ? parseFloat(row.ebay_price) : undefined,
          parsed: row.parsed,
          captureReason: row.capture_reason,
          scrydexMatched: row.scrydex_matched,
          scrydexCardId: row.scrydex_card_id || undefined,
          scrydexCardName: row.scrydex_card_name || undefined,
          expansionMatched: row.expansion_matched || undefined,
          status: row.status,
          reviewedAt: row.reviewed_at?.toISOString(),
          reviewNotes: row.review_notes || undefined,
          expected: row.expected || undefined,
        };
        this.corpus.set(entry.id, entry);

        // Rebuild signature cache
        const signature = this.getPatternSignature(entry.parsed);
        this.capturedSignatures.add(signature);
      }

      // Load feedback entries
      const feedbackResult = await query<{
        id: string;
        timestamp: Date;
        deal_id: string;
        ebay_title: string;
        matched_card_name: string | null;
        matched_expansion: string | null;
        matched_card_number: string | null;
        confidence: number | null;
        feedback_type: 'wrong_match' | 'wrong_price' | 'other';
        wrong_match_reason: 'card_name' | 'card_number' | 'set' | 'condition' | 'wrong_card' | 'wrong_price' | 'no_scrydex_match' | null;
        notes: string | null;
      }>(`SELECT * FROM training_feedback ORDER BY timestamp DESC LIMIT $1`, [MAX_FEEDBACK_SIZE]);

      for (const row of feedbackResult.rows) {
        const entry: FeedbackEntry = {
          id: row.id,
          timestamp: row.timestamp.toISOString(),
          dealId: row.deal_id,
          ebayTitle: row.ebay_title,
          matchedCardName: row.matched_card_name || '',
          matchedExpansion: row.matched_expansion || '',
          matchedCardNumber: row.matched_card_number || '',
          confidence: row.confidence || 0,
          feedbackType: row.feedback_type,
          wrongMatchReason: row.wrong_match_reason || undefined,
          notes: row.notes || undefined,
        };
        this.feedback.set(entry.id, entry);
      }

      logger.debug('CORPUS_LOADED_FROM_DB', {
        corpus: this.corpus.size,
        feedback: this.feedback.size,
      });
    } catch (err) {
      logger.error('CORPUS_LOAD_ERROR', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  private async saveCorpusEntry(entry: CorpusEntry): Promise<void> {
    if (!isConnected()) return;

    try {
      await query(
        `INSERT INTO training_corpus (
          id, timestamp, ebay_title, ebay_item_id, ebay_price, parsed,
          capture_reason, scrydex_matched, scrydex_card_id, scrydex_card_name,
          expansion_matched, status, reviewed_at, review_notes, expected
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          reviewed_at = EXCLUDED.reviewed_at,
          review_notes = EXCLUDED.review_notes,
          expected = EXCLUDED.expected`,
        [
          entry.id,
          entry.timestamp,
          entry.ebayTitle,
          entry.ebayItemId || null,
          entry.ebayPrice || null,
          JSON.stringify(entry.parsed),
          entry.captureReason,
          entry.scrydexMatched,
          entry.scrydexCardId || null,
          entry.scrydexCardName || null,
          entry.expansionMatched || null,
          entry.status,
          entry.reviewedAt || null,
          entry.reviewNotes || null,
          entry.expected ? JSON.stringify(entry.expected) : null,
        ]
      );
    } catch (err) {
      logger.error('CORPUS_SAVE_ERROR', {
        error: err instanceof Error ? err.message : 'Unknown',
        entryId: entry.id,
      });
    }
  }

  private async saveFeedbackEntry(entry: FeedbackEntry): Promise<void> {
    if (!isConnected()) return;

    try {
      await query(
        `INSERT INTO training_feedback (
          id, timestamp, deal_id, ebay_title, matched_card_name,
          matched_expansion, matched_card_number, confidence, feedback_type,
          wrong_match_reason, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING`,
        [
          entry.id,
          entry.timestamp,
          entry.dealId,
          entry.ebayTitle,
          entry.matchedCardName,
          entry.matchedExpansion,
          entry.matchedCardNumber,
          entry.confidence,
          entry.feedbackType,
          entry.wrongMatchReason || null,
          entry.notes || null,
        ]
      );
    } catch (err) {
      logger.error('FEEDBACK_SAVE_ERROR', {
        error: err instanceof Error ? err.message : 'Unknown',
        entryId: entry.id,
      });
    }
  }

  private async clearFromDatabase(
    corpusIds: string[],
    keepVerified: boolean,
    clearFeedback: boolean
  ): Promise<void> {
    if (!isConnected()) return;

    try {
      if (keepVerified && corpusIds.length > 0) {
        // Delete specific entries
        await query(
          `DELETE FROM training_corpus WHERE id = ANY($1)`,
          [corpusIds]
        );
      } else if (!keepVerified) {
        // Delete all corpus entries
        await query(`DELETE FROM training_corpus`);
      }

      if (clearFeedback) {
        await query(`DELETE FROM training_feedback`);
      }

      logger.debug('CORPUS_DB_CLEARED', {
        corpusDeleted: keepVerified ? corpusIds.length : 'all',
        feedbackDeleted: clearFeedback,
      });
    } catch (err) {
      logger.error('CORPUS_DB_CLEAR_ERROR', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Daily Counter Management
  // ─────────────────────────────────────────────────────────────────────────

  private resetDailyCounterIfNeeded(): void {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.todayPendingCount = 0;
      this.lastResetDate = today;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Deduplication
  // ─────────────────────────────────────────────────────────────────────────

  private getPatternSignature(parsed: ParsedTitle): string {
    // Create a signature based on: setName + cardNumber format + variant type
    const parts = [
      parsed.setName || 'unknown',
      parsed.cardNumber ? 'has_number' : 'no_number',
      parsed.variant.isHolo ? 'holo' : '',
      parsed.variant.isReverseHolo ? 'reverse' : '',
      parsed.variant.isFullArt ? 'fa' : '',
      parsed.isGraded ? `graded_${parsed.gradingCompany}` : 'raw',
    ].filter(Boolean);

    return parts.join(':').toLowerCase();
  }

  private isDuplicate(parsed: ParsedTitle, reason: CaptureReason): boolean {
    // Always capture user feedback
    if (reason === 'user_feedback') return false;

    // Always capture successful deals (ground truth)
    if (reason === 'successful_deal') return false;

    const signature = this.getPatternSignature(parsed);

    // Check if we've already captured this pattern
    if (this.capturedSignatures.has(signature)) {
      return true;
    }

    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-Capture (called from arbitrage engine)
  // ─────────────────────────────────────────────────────────────────────────

  capture(params: {
    ebayTitle: string;
    ebayItemId?: string;
    ebayPrice?: number;
    parsed: ParsedTitle;
    reason: CaptureReason;
    scrydexMatched: boolean;
    scrydexCardId?: string;
    scrydexCardName?: string;
    expansionMatched?: string;
  }): boolean {
    this.resetDailyCounterIfNeeded();

    const { parsed, reason } = params;

    // Check daily limit for pending entries
    if (reason !== 'successful_deal' && this.todayPendingCount >= MAX_PENDING_PER_DAY) {
      return false;
    }

    // Check deduplication
    if (this.isDuplicate(parsed, reason)) {
      return false;
    }

    // Check corpus size limit
    if (this.corpus.size >= MAX_CORPUS_SIZE) {
      this.pruneOldEntries();
    }

    // Create entry
    const entry: CorpusEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ebayTitle: params.ebayTitle,
      ebayItemId: params.ebayItemId,
      ebayPrice: params.ebayPrice,
      parsed: params.parsed,
      captureReason: reason,
      scrydexMatched: params.scrydexMatched,
      scrydexCardId: params.scrydexCardId,
      scrydexCardName: params.scrydexCardName,
      expansionMatched: params.expansionMatched,
      status: reason === 'successful_deal' ? 'verified' : 'pending',
    };

    // If successful deal, set expected values automatically
    if (reason === 'successful_deal' && params.scrydexMatched) {
      entry.expected = {
        cardName: params.scrydexCardName,
        cardNumber: parsed.cardNumber || undefined,
        setName: params.expansionMatched,
        isCorrectMatch: true,
      };
    }

    this.corpus.set(entry.id, entry);

    // Persist to database (fire and forget)
    this.saveCorpusEntry(entry).catch(() => {});

    // Track signature for deduplication
    const signature = this.getPatternSignature(parsed);
    this.capturedSignatures.add(signature);

    // Increment daily counter
    if (entry.status === 'pending') {
      this.todayPendingCount++;
    }

    logger.debug('CORPUS_CAPTURE', {
      id: entry.id,
      reason,
      title: params.ebayTitle.substring(0, 50),
      status: entry.status,
    });

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // User Feedback
  // ─────────────────────────────────────────────────────────────────────────

  addFeedback(params: {
    dealId: string;
    ebayTitle: string;
    matchedCardName: string;
    matchedExpansion: string;
    matchedCardNumber: string;
    confidence: number;
    feedbackType: 'wrong_match' | 'wrong_price' | 'other';
    wrongMatchReason?: 'card_name' | 'card_number' | 'set' | 'condition' | 'wrong_card' | 'wrong_variant' | 'wrong_price' | 'no_scrydex_match';
    notes?: string;
  }): string {
    // Prune if needed
    if (this.feedback.size >= MAX_FEEDBACK_SIZE) {
      const oldest = Array.from(this.feedback.values())
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0];
      if (oldest) this.feedback.delete(oldest.id);
    }

    const entry: FeedbackEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...params,
    };

    this.feedback.set(entry.id, entry);

    // Persist to database (fire and forget)
    this.saveFeedbackEntry(entry).catch(() => {});

    // Also capture to corpus for training
    const parsed = titleParser.parse(params.ebayTitle);
    this.capture({
      ebayTitle: params.ebayTitle,
      parsed,
      reason: 'user_feedback',
      scrydexMatched: true,
      scrydexCardName: params.matchedCardName,
      expansionMatched: params.matchedExpansion,
    });

    logger.info('FEEDBACK_ADDED', {
      id: entry.id,
      dealId: params.dealId,
      type: params.feedbackType,
      wrongMatchReason: params.wrongMatchReason,
    });

    return entry.id;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Analytics Tracking (called during processing)
  // ─────────────────────────────────────────────────────────────────────────

  trackParse(parsed: ParsedTitle): void {
    this.analytics.totalProcessed++;
    this.analytics.confidenceSum += parsed.confidenceScore;

    // Track confidence distribution
    if (parsed.confidenceScore >= 85) {
      this.analytics.confidenceCounts.perfect++;
    } else if (parsed.confidenceScore >= 70) {
      this.analytics.confidenceCounts.high++;
    } else if (parsed.confidenceScore >= 50) {
      this.analytics.confidenceCounts.medium++;
    } else {
      this.analytics.confidenceCounts.low++;
    }

    // Track pattern hits
    for (const pattern of parsed.matchedPatterns) {
      const count = this.analytics.patternHits.get(pattern) || 0;
      this.analytics.patternHits.set(pattern, count + 1);
    }
  }

  trackMatch(): void {
    this.analytics.totalMatched++;
  }

  trackDeal(): void {
    this.analytics.totalDeals++;
  }

  trackSkip(reason: string): void {
    const count = this.analytics.skipReasons.get(reason) || 0;
    this.analytics.skipReasons.set(reason, count + 1);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Set Match Failure Tracking (for improving expansion matching)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Track a set match failure for later analysis and improvement
   */
  async trackSetMatchFailure(details: {
    parsedSetName: string;
    cardNumber?: string;
    promoPrefix?: string;
    ebayTitle?: string;
    ebayItemId?: string;
    nearMisses?: Array<{ expansionId: string; expansionName: string; matchScore: number }>;
  }): Promise<void> {
    if (!isConnected()) return;

    try {
      // Use UPSERT to increment count if same set name + card number exists
      await query(`
        INSERT INTO set_match_failures (parsed_set_name, card_number, promo_prefix, ebay_title, ebay_item_id, near_misses)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (parsed_set_name, card_number)
        DO UPDATE SET
          hit_count = set_match_failures.hit_count + 1,
          last_seen = NOW(),
          ebay_title = COALESCE(EXCLUDED.ebay_title, set_match_failures.ebay_title),
          ebay_item_id = COALESCE(EXCLUDED.ebay_item_id, set_match_failures.ebay_item_id),
          near_misses = COALESCE(EXCLUDED.near_misses, set_match_failures.near_misses)
      `, [
        details.parsedSetName || '',
        details.cardNumber || null,
        details.promoPrefix || null,
        details.ebayTitle || null,
        details.ebayItemId || null,
        details.nearMisses ? JSON.stringify(details.nearMisses) : null,
      ]);
    } catch (error) {
      logger.warn('SET_MATCH_FAILURE_TRACK_ERROR', {
        error: error instanceof Error ? error.message : String(error),
        setName: details.parsedSetName,
      });
    }
  }

  /**
   * Get set match failures for analysis, sorted by hit count
   */
  async getSetMatchFailures(options?: {
    limit?: number;
    includeResolved?: boolean;
    minHitCount?: number;
  }): Promise<Array<{
    id: number;
    parsedSetName: string;
    cardNumber: string | null;
    promoPrefix: string | null;
    ebayTitle: string | null;
    ebayItemId: string | null;
    nearMisses: Array<{ expansionId: string; expansionName: string; matchScore: number }> | null;
    hitCount: number;
    firstSeen: string;
    lastSeen: string;
    resolved: boolean;
    resolvedExpansionId: string | null;
    notes: string | null;
  }>> {
    if (!isConnected()) return [];

    const limit = options?.limit ?? 100;
    const includeResolved = options?.includeResolved ?? false;
    const minHitCount = options?.minHitCount ?? 1;

    try {
      const result = await query<{
        id: number;
        parsed_set_name: string;
        card_number: string | null;
        promo_prefix: string | null;
        ebay_title: string | null;
        ebay_item_id: string | null;
        near_misses: Array<{ expansionId: string; expansionName: string; matchScore: number }> | null;
        hit_count: number;
        first_seen: Date;
        last_seen: Date;
        resolved: boolean;
        resolved_expansion_id: string | null;
        notes: string | null;
      }>(`
        SELECT * FROM set_match_failures
        WHERE hit_count >= $1
        ${includeResolved ? '' : 'AND resolved = FALSE'}
        ORDER BY hit_count DESC, last_seen DESC
        LIMIT $2
      `, [minHitCount, limit]);

      return result.rows.map(row => ({
        id: row.id,
        parsedSetName: row.parsed_set_name,
        cardNumber: row.card_number,
        promoPrefix: row.promo_prefix,
        ebayTitle: row.ebay_title,
        ebayItemId: row.ebay_item_id,
        nearMisses: row.near_misses,
        hitCount: row.hit_count,
        firstSeen: row.first_seen.toISOString(),
        lastSeen: row.last_seen.toISOString(),
        resolved: row.resolved,
        resolvedExpansionId: row.resolved_expansion_id,
        notes: row.notes,
      }));
    } catch (error) {
      logger.error('SET_MATCH_FAILURES_FETCH_ERROR', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Mark a set match failure as resolved (e.g., after adding an alias)
   */
  async resolveSetMatchFailure(id: number, expansionId: string, notes?: string): Promise<boolean> {
    if (!isConnected()) return false;

    try {
      const result = await query(`
        UPDATE set_match_failures
        SET resolved = TRUE, resolved_expansion_id = $2, notes = $3
        WHERE id = $1
      `, [id, expansionId, notes || null]);

      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      logger.error('SET_MATCH_FAILURE_RESOLVE_ERROR', {
        error: error instanceof Error ? error.message : String(error),
        id,
      });
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Review Operations
  // ─────────────────────────────────────────────────────────────────────────

  getPending(limit = 50): CorpusEntry[] {
    return Array.from(this.corpus.values())
      .filter(e => e.status === 'pending')
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  getEntry(id: string): CorpusEntry | undefined {
    return this.corpus.get(id);
  }

  review(id: string, status: CorpusStatus, notes?: string, expected?: CorpusEntry['expected']): boolean {
    const entry = this.corpus.get(id);
    if (!entry) return false;

    entry.status = status;
    entry.reviewedAt = new Date().toISOString();
    if (notes) entry.reviewNotes = notes;
    if (expected) entry.expected = expected;

    // Persist to database (fire and forget)
    this.saveCorpusEntry(entry).catch(() => {});

    logger.info('CORPUS_REVIEWED', { id, status });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Testing
  // ─────────────────────────────────────────────────────────────────────────

  runTests(): TestRunResult {
    const startTime = Date.now();
    const results: TestResult[] = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    // Get all verified entries with expected values
    const testCases = Array.from(this.corpus.values())
      .filter(e => e.status === 'verified' && e.expected);

    for (const entry of testCases) {
      // Re-parse the title
      const parsed = titleParser.parse(entry.ebayTitle);
      const differences: string[] = [];

      // Compare with expected
      if (entry.expected?.cardName && parsed.cardName !== entry.expected.cardName) {
        differences.push(`cardName: expected "${entry.expected.cardName}", got "${parsed.cardName}"`);
      }
      if (entry.expected?.cardNumber && parsed.cardNumber !== entry.expected.cardNumber) {
        differences.push(`cardNumber: expected "${entry.expected.cardNumber}", got "${parsed.cardNumber}"`);
      }
      if (entry.expected?.setName && parsed.setName !== entry.expected.setName) {
        differences.push(`setName: expected "${entry.expected.setName}", got "${parsed.setName}"`);
      }

      const testPassed = differences.length === 0;
      if (testPassed) {
        passed++;
      } else {
        failed++;
      }

      results.push({
        entryId: entry.id,
        ebayTitle: entry.ebayTitle,
        passed: testPassed,
        expected: entry.expected || {},
        actual: {
          cardName: parsed.cardName,
          cardNumber: parsed.cardNumber,
          setName: parsed.setName,
        },
        differences,
      });
    }

    const duration = Date.now() - startTime;

    return {
      timestamp: new Date().toISOString(),
      totalTests: testCases.length,
      passed,
      failed,
      skipped,
      duration,
      results,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stats & Analytics
  // ─────────────────────────────────────────────────────────────────────────

  getStats(): CorpusStats {
    const entries = Array.from(this.corpus.values());

    const byReason: Record<CaptureReason, number> = {
      low_confidence: 0,
      no_scrydex_match: 0,
      successful_deal: 0,
      user_feedback: 0,
      name_mismatch: 0,
    };

    let pending = 0, verified = 0, incorrect = 0, skipped = 0;

    for (const entry of entries) {
      byReason[entry.captureReason]++;

      switch (entry.status) {
        case 'pending': pending++; break;
        case 'verified': verified++; break;
        case 'incorrect': incorrect++; break;
        case 'skipped': skipped++; break;
      }
    }

    return {
      total: entries.length,
      pending,
      verified,
      incorrect,
      skipped,
      byReason,
    };
  }

  getAnalytics(): ParserAnalytics {
    const avgConfidence = this.analytics.totalProcessed > 0
      ? this.analytics.confidenceSum / this.analytics.totalProcessed
      : 0;

    // Convert Maps to Records
    const patternHits: Record<string, number> = {};
    for (const [key, value] of this.analytics.patternHits) {
      patternHits[key] = value;
    }

    const skipReasons: Record<string, number> = {};
    for (const [key, value] of this.analytics.skipReasons) {
      skipReasons[key] = value;
    }

    return {
      confidenceDistribution: { ...this.analytics.confidenceCounts },
      patternHits,
      skipReasons,
      totalProcessed: this.analytics.totalProcessed,
      totalMatched: this.analytics.totalMatched,
      totalDeals: this.analytics.totalDeals,
      averageConfidence: Math.round(avgConfidence * 10) / 10,
      since: this.analytics.startTime,
    };
  }

  getFeedback(limit = 50): FeedbackEntry[] {
    return Array.from(this.feedback.values())
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Maintenance
  // ─────────────────────────────────────────────────────────────────────────

  private pruneOldEntries(): void {
    // Remove oldest pending entries first, keep verified
    const entries = Array.from(this.corpus.entries())
      .sort((a, b) => {
        // Prioritize keeping verified entries
        if (a[1].status === 'verified' && b[1].status !== 'verified') return -1;
        if (b[1].status === 'verified' && a[1].status !== 'verified') return 1;
        // Then by timestamp (newest first)
        return b[1].timestamp.localeCompare(a[1].timestamp);
      });

    // Keep top MAX_CORPUS_SIZE - 100 (leave room for new entries)
    const toKeep = entries.slice(0, MAX_CORPUS_SIZE - 100);
    this.corpus = new Map(toKeep);

    logger.info('CORPUS_PRUNED', {
      removed: entries.length - toKeep.length,
      remaining: this.corpus.size,
    });
  }

  // Export corpus for backup/analysis
  export(): { corpus: CorpusEntry[]; feedback: FeedbackEntry[] } {
    return {
      corpus: Array.from(this.corpus.values()),
      feedback: Array.from(this.feedback.values()),
    };
  }

  // Clear corpus to start fresh (after reviewing report)
  clear(options: { keepVerified?: boolean; clearFeedback?: boolean } = {}): {
    corpusCleared: number;
    feedbackCleared: number;
    verifiedKept: number;
  } {
    const { keepVerified = false, clearFeedback = true } = options;

    let corpusCleared = 0;
    let verifiedKept = 0;
    const idsToDelete: string[] = [];

    if (keepVerified) {
      // Keep verified entries for regression testing
      const entries = Array.from(this.corpus.entries());
      for (const [id, entry] of entries) {
        if (entry.status === 'verified') {
          verifiedKept++;
        } else {
          this.corpus.delete(id);
          idsToDelete.push(id);
          corpusCleared++;
        }
      }
    } else {
      idsToDelete.push(...Array.from(this.corpus.keys()));
      corpusCleared = this.corpus.size;
      this.corpus.clear();
    }

    let feedbackCleared = 0;
    if (clearFeedback) {
      feedbackCleared = this.feedback.size;
      this.feedback.clear();
    }

    // Clear from database (fire and forget)
    this.clearFromDatabase(idsToDelete, keepVerified, clearFeedback).catch(() => {});

    logger.info('CORPUS_CLEARED', {
      corpusCleared,
      feedbackCleared,
      verifiedKept,
    });

    return { corpusCleared, feedbackCleared, verifiedKept };
  }

  // Import corpus (for restoration)
  import(data: { corpus: CorpusEntry[]; feedback?: FeedbackEntry[] }): void {
    this.corpus.clear();
    for (const entry of data.corpus) {
      this.corpus.set(entry.id, entry);
    }

    if (data.feedback) {
      this.feedback.clear();
      for (const entry of data.feedback) {
        this.feedback.set(entry.id, entry);
      }
    }

    logger.info('CORPUS_IMPORTED', {
      corpusEntries: this.corpus.size,
      feedbackEntries: this.feedback.size,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Generate Report for Claude
  // Produces structured output for parser improvement
  // ─────────────────────────────────────────────────────────────────────────

  generateReport(): string {
    const entries = Array.from(this.corpus.values());
    const feedbackEntries = Array.from(this.feedback.values());
    const analytics = this.getAnalytics();

    // Group entries by status and reason
    const incorrect = entries.filter(e => e.status === 'incorrect');
    const wrongMatches = feedbackEntries.filter(f => f.feedbackType === 'wrong_match');
    const lowConfidence = entries.filter(e => e.captureReason === 'low_confidence');
    const nameMismatches = entries.filter(e => e.captureReason === 'name_mismatch');
    const noScrydexMatch = entries.filter(e => e.captureReason === 'no_scrydex_match');

    // Count wrong matches by reason
    const reasonCounts: Record<string, number> = {};
    for (const f of wrongMatches) {
      const reason = f.wrongMatchReason || 'unspecified';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }

    // Map reason codes to readable labels for summary
    const reasonSummaryLabels: Record<string, string> = {
      card_name: 'Card Name',
      card_number: 'Card Number',
      set: 'Set/Expansion',
      condition: 'Condition',
      wrong_card: 'Wrong Card (Scrydex mismatch)',
      wrong_price: 'Wrong Price',
      no_scrydex_match: 'No Scrydex Match Found',
      unspecified: 'Unspecified',
    };

    const reasonBreakdown = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => `  - ${reasonSummaryLabels[reason] || reason}: ${count}`)
      .join('\n');

    let report = `# Parser Improvement Report
Generated: ${new Date().toISOString()}

## Summary
- Total entries reviewed: ${entries.length}
- Marked incorrect: ${incorrect.length}
- User-reported wrong matches: ${wrongMatches.length}
${reasonBreakdown ? `  Breakdown by reason:\n${reasonBreakdown}` : ''}
- Low confidence captures: ${lowConfidence.length}
- Name mismatches: ${nameMismatches.length}
- No Scrydex match: ${noScrydexMatch.length}

## Analytics (since ${analytics.since})
- Total processed: ${analytics.totalProcessed}
- Total matched: ${analytics.totalMatched}
- Total deals: ${analytics.totalDeals}
- Average confidence: ${analytics.averageConfidence}%

### Confidence Distribution
- Perfect (85+): ${analytics.confidenceDistribution.perfect}
- High (70-84): ${analytics.confidenceDistribution.high}
- Medium (50-69): ${analytics.confidenceDistribution.medium}
- Low (<50): ${analytics.confidenceDistribution.low}

### Top Skip Reasons
${Object.entries(analytics.skipReasons)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([reason, count]) => `- ${reason}: ${count}`)
  .join('\n')}

`;

    // Wrong matches reported by users
    if (wrongMatches.length > 0) {
      // Map reason codes to readable labels
      const reasonLabels: Record<string, string> = {
        card_name: 'Card Name was wrong',
        card_number: 'Card Number was wrong',
        set: 'Set/Expansion was wrong',
        condition: 'Condition was wrong',
        wrong_card: 'Parser correct, but Scrydex returned different card',
        wrong_price: 'Wrong grade/condition price used',
        no_scrydex_match: 'Parser correct, but no Scrydex match found',
      };

      report += `## User-Reported Wrong Matches (PRIORITY)
These are deals where the user clicked "Report Wrong Match":

`;
      for (const f of wrongMatches.slice(0, 20)) {
        const reasonLabel = f.wrongMatchReason
          ? reasonLabels[f.wrongMatchReason] || f.wrongMatchReason
          : 'Not specified';

        report += `### Title: "${f.ebayTitle}"
- Matched as: ${f.matchedCardName} (${f.matchedExpansion}) #${f.matchedCardNumber}
- Confidence was: ${f.confidence}%
- **Reason reported:** ${reasonLabel}
- Notes: ${f.notes || 'None'}

`;
      }
    }

    // Entries marked incorrect during review
    if (incorrect.length > 0) {
      report += `## Entries Marked Incorrect
These were reviewed and marked as incorrect matches:

`;
      for (const e of incorrect.slice(0, 20)) {
        report += `### Title: "${e.ebayTitle}"
- Parser extracted: name="${e.parsed.cardName}", set="${e.parsed.setName}", number="${e.parsed.cardNumber}"
- Confidence: ${e.parsed.confidenceScore}%
- Expected: ${e.expected ? `name="${e.expected.cardName}", set="${e.expected.setName}", number="${e.expected.cardNumber}"` : 'Not specified'}
- Review notes: ${e.reviewNotes || 'None'}
- Scrydex matched: ${e.scrydexMatched ? `Yes - ${e.scrydexCardName}` : 'No'}

`;
      }
    }

    // Name mismatches (parser found something but it didn't match Scrydex)
    if (nameMismatches.length > 0) {
      report += `## Name Mismatches
Parser extracted a name that didn't match the Scrydex result:

`;
      for (const e of nameMismatches.slice(0, 15)) {
        report += `- Title: "${e.ebayTitle.substring(0, 80)}..."
  Parser said: "${e.parsed.cardName}" | Scrydex returned: "${e.scrydexCardName}"

`;
      }
    }

    // Low confidence parses
    if (lowConfidence.length > 0) {
      report += `## Low Confidence Parses (50-59%)
These had decent confidence but were below threshold:

`;
      for (const e of lowConfidence.slice(0, 15)) {
        report += `- Title: "${e.ebayTitle.substring(0, 80)}..."
  Extracted: name="${e.parsed.cardName}", set="${e.parsed.setName}", number="${e.parsed.cardNumber}"
  Confidence: ${e.parsed.confidenceScore}%

`;
      }
    }

    // No Scrydex match
    if (noScrydexMatch.length > 0) {
      report += `## No Scrydex Match
Parser extracted data but card wasn't found in Scrydex:

`;
      for (const e of noScrydexMatch.slice(0, 15)) {
        report += `- Title: "${e.ebayTitle.substring(0, 80)}..."
  Extracted: name="${e.parsed.cardName}", set="${e.parsed.setName}", number="${e.parsed.cardNumber}"
  Expansion matched: ${e.expansionMatched || 'None'}

`;
      }
    }

    // Pattern hits (what's working)
    if (Object.keys(analytics.patternHits).length > 0) {
      report += `## Pattern Hits (What's Working)
${Object.entries(analytics.patternHits)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([pattern, count]) => `- ${pattern}: ${count} hits`)
  .join('\n')}

`;
    }

    report += `---
END OF REPORT

To improve the parser, copy this report and paste it to Claude with a request like:
"Here's the parser training report. Please analyze and suggest improvements to the parser."
`;

    return report;
  }
}

export const corpusService = new CorpusService();
