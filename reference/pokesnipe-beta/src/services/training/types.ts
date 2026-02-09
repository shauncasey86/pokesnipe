// src/services/training/types.ts
// ═══════════════════════════════════════════════════════════════════════════
// Training Corpus Types
// ═══════════════════════════════════════════════════════════════════════════

import type { ParsedTitle } from '../parser/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Corpus Entry Status
// ─────────────────────────────────────────────────────────────────────────────

export type CorpusStatus = 'pending' | 'verified' | 'incorrect' | 'skipped';

export type CaptureReason =
  | 'low_confidence'      // Confidence 50-70
  | 'no_scrydex_match'    // Parser succeeded but Scrydex didn't find card
  | 'successful_deal'     // Full pipeline success (ground truth)
  | 'user_feedback'       // User reported wrong match
  | 'name_mismatch';      // Card name similarity too low

// ─────────────────────────────────────────────────────────────────────────────
// Corpus Entry
// ─────────────────────────────────────────────────────────────────────────────

export interface CorpusEntry {
  id: string;
  timestamp: string;

  // Original input
  ebayTitle: string;
  ebayItemId?: string;
  ebayPrice?: number;

  // Parser output
  parsed: ParsedTitle;

  // Match result
  captureReason: CaptureReason;
  scrydexMatched: boolean;
  scrydexCardId?: string;
  scrydexCardName?: string;
  expansionMatched?: string;

  // Review status
  status: CorpusStatus;
  reviewedAt?: string;
  reviewNotes?: string;

  // Expected values (for regression testing)
  expected?: {
    cardName?: string;
    cardNumber?: string;
    setName?: string;
    isCorrectMatch?: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// User Feedback Entry
// ─────────────────────────────────────────────────────────────────────────────

export interface FeedbackEntry {
  id: string;
  timestamp: string;
  dealId: string;
  ebayTitle: string;

  // What was matched
  matchedCardName: string;
  matchedExpansion: string;
  matchedCardNumber: string;
  confidence: number;

  // User feedback
  feedbackType: 'wrong_match' | 'wrong_price' | 'other';
  // Specific reason for wrong match (what was incorrect)
  // - card_name/card_number/set/condition: Parser extracted wrong data
  // - wrong_card: Parser correct but Scrydex returned different card
  // - wrong_variant: Correct card but wrong variant (holo, reverse, 1st ed, etc.)
  // - wrong_price: Correct card but wrong price used (wrong grade, condition, or variant price)
  // - no_scrydex_match: Parser correct but no Scrydex match found (card not in database)
  wrongMatchReason?: 'card_name' | 'card_number' | 'set' | 'condition' | 'wrong_card' | 'wrong_variant' | 'wrong_price' | 'no_scrydex_match';
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ParserAnalytics {
  // Confidence distribution
  confidenceDistribution: {
    perfect: number;   // 85+
    high: number;      // 70-84
    medium: number;    // 50-69
    low: number;       // <50
  };

  // Pattern hit rates
  patternHits: Record<string, number>;

  // Common skip reasons
  skipReasons: Record<string, number>;

  // Recent stats
  totalProcessed: number;
  totalMatched: number;
  totalDeals: number;
  averageConfidence: number;

  // Time range
  since: string;
}

export interface CorpusStats {
  total: number;
  pending: number;
  verified: number;
  incorrect: number;
  skipped: number;

  byReason: Record<CaptureReason, number>;

  // Test stats
  lastTestRun?: string;
  lastTestPassed?: number;
  lastTestFailed?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Result
// ─────────────────────────────────────────────────────────────────────────────

export interface TestResult {
  entryId: string;
  ebayTitle: string;
  passed: boolean;

  expected: {
    cardName?: string;
    cardNumber?: string;
    setName?: string;
  };

  actual: {
    cardName: string | null;
    cardNumber: string | null;
    setName: string | null;
  };

  differences: string[];
}

export interface TestRunResult {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: TestResult[];
}
