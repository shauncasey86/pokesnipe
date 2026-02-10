/**
 * Matching engine stub — placeholder until Stage 7 is implemented.
 *
 * matchListing() always returns null (no match). When the real matching
 * engine is built, it will replace this file with candidate lookup,
 * name validation, variant resolution, and confidence scoring.
 */

import type { NormalizedListing } from '../extraction/signal-merger.js';

type Condition = 'NM' | 'LP' | 'MP' | 'HP';

interface ConditionPrice {
  low: number;
  market: number;
}

export interface MatchResult {
  card: {
    scrydexCardId: string;
    name: string;
    number: string;
  };
  variant: {
    id: number;
    name: string;
    prices: Partial<Record<Condition, ConditionPrice>>;
  };
  confidence: {
    composite: number;
    name: number;
    number: number;
    expansion: number;
    variant: number;
  };
}

/**
 * Attempt to match a normalized eBay listing against the card database.
 * Returns null if no confident match is found.
 *
 * TODO: Implement Stage 7 matching engine:
 * - Candidate lookup (fuzzy search by name + number)
 * - Name validation (Jaro-Winkler similarity)
 * - Expansion validation
 * - Variant resolution
 * - Confidence scoring (weighted geometric mean)
 * - Confidence gates (pass/fail thresholds)
 */
export async function matchListing(
  _listing: NormalizedListing,
): Promise<MatchResult | null> {
  // Stub: no matches until Stage 7 is implemented
  return null;
}
