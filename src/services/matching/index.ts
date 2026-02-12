import pino from 'pino';
import type { NormalizedListing } from '../extraction/signal-merger.js';
import { findCandidates } from './candidate-lookup.js';
import { validateName, NAME_HARD_GATE } from './name-validator.js';
import { validateExpansion } from './expansion-validator.js';
import { resolveVariant } from './variant-resolver.js';
import { computeConfidence } from './confidence-scorer.js';
import type { ConfidenceResult } from './confidence-scorer.js';
import { passesGate } from './gates.js';

const log = pino({ name: 'matching' });

type Condition = 'NM' | 'LP' | 'MP' | 'HP';

interface ConditionPrice {
  low: number;
  market: number;
}

interface GradedPrice {
  low: number;
  market: number;
  mid?: number;
  high?: number;
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
    gradedPrices: Record<string, GradedPrice> | null;
  };
  confidence: ConfidenceResult['signals'] & { composite: number };
  strategy: string;
  variantMethod: string;
}

/**
 * Extract the raw condition prices from a variant's prices JSONB.
 * Handles both { raw: { NM: ... } } and flat { NM: ... } formats.
 */
function extractRawPrices(
  prices: Record<string, unknown>,
): Partial<Record<Condition, ConditionPrice>> {
  if (prices['raw'] && typeof prices['raw'] === 'object') {
    return prices['raw'] as Partial<Record<Condition, ConditionPrice>>;
  }
  // Flat format — check if any condition key exists
  const conditions: Condition[] = ['NM', 'LP', 'MP', 'HP'];
  const hasCondition = conditions.some((c) => c in prices);
  if (hasCondition) {
    return prices as Partial<Record<Condition, ConditionPrice>>;
  }
  return {};
}

/**
 * Attempt to match a normalized eBay listing against the card database.
 * Returns null if no confident match is found.
 *
 * Pipeline:
 * 1. Candidate lookup (number-first, 4 strategies)
 * 2. For each candidate: name validation, expansion validation
 * 3. Pick best candidate by name similarity
 * 4. Variant resolution
 * 5. Confidence scoring (weighted geometric mean)
 * 6. Gate check (reject < 0.45)
 */
export async function matchListing(
  listing: NormalizedListing,
): Promise<MatchResult | null> {
  // Step 1: Find candidates
  const { candidates, strategy } = await findCandidates(
    listing.cardNumber,
    listing.cardName,
    listing.setName,
  );

  if (candidates.length === 0) return null;

  // Step 2: Score each candidate
  let bestCandidate = candidates[0]!;
  let bestNameScore = 0;
  let bestExpansionScore = 0;

  for (const candidate of candidates) {
    // Name validation
    let nameScore = 0.50; // default when no name extracted
    if (listing.cardName) {
      nameScore = validateName(listing.cardName, candidate.name);
      if (nameScore < NAME_HARD_GATE) continue; // hard gate — skip this candidate
    } else if (candidates.length > 1) {
      // Multiple candidates with no name to differentiate — penalize confidence
      // to prevent wrong-set matches (e.g. 83/78 matching Candela instead of Genesect)
      nameScore = 0.30;
    }

    // Expansion validation
    const expansionScore = validateExpansion(
      listing.setName,
      candidate.expansionName,
      candidate.expansionCode,
    );

    // Pick the candidate with the best combined score
    const combinedScore = nameScore * 0.7 + expansionScore * 0.3;
    const bestCombined = bestNameScore * 0.7 + bestExpansionScore * 0.3;
    if (combinedScore > bestCombined) {
      bestCandidate = candidate;
      bestNameScore = nameScore;
      bestExpansionScore = expansionScore;
    }
  }

  // If we had a card name and all candidates failed the name gate, reject
  if (listing.cardName && bestNameScore < NAME_HARD_GATE) return null;

  // Step 3: Variant resolution
  const variantResult = resolveVariant(listing.variant, bestCandidate.variants);
  if (!variantResult) {
    log.debug({ card: bestCandidate.name }, 'No variant with pricing data');
    return null;
  }

  // Step 4: Compute confidence scores
  const numberScore = listing.cardNumber ? 1.0 : 0.0;
  const denominatorScore =
    listing.cardNumber?.denominator != null &&
    listing.cardNumber.denominator === bestCandidate.printedTotal
      ? 1.0
      : listing.cardNumber?.denominator != null
        ? 0.20
        : 0.50; // neutral if no denominator

  // Signal extraction quality: how many signals were extracted?
  const signalCount = [
    listing.cardName,
    listing.cardNumber,
    listing.setName,
    listing.variant,
  ].filter(Boolean).length;
  const normalizationScore = Math.min(1.0, 0.25 + signalCount * 0.25);

  const confidence = computeConfidence({
    name: bestNameScore || 0.50,
    number: numberScore,
    denominator: denominatorScore,
    expansion: bestExpansionScore,
    variant: variantResult.confidence,
    normalization: normalizationScore,
  });

  // Step 5: Gate check
  if (!passesGate(confidence.composite)) {
    log.debug(
      { card: bestCandidate.name, confidence: confidence.composite },
      'Match rejected by confidence gate',
    );
    return null;
  }

  const rawPrices = extractRawPrices(
    variantResult.variant.prices as Record<string, unknown>,
  );

  return {
    card: {
      scrydexCardId: bestCandidate.scrydexCardId,
      name: bestCandidate.name,
      number: bestCandidate.number,
    },
    variant: {
      id: variantResult.variant.id,
      name: variantResult.variant.name,
      prices: rawPrices,
      gradedPrices: variantResult.variant.gradedPrices || null,
    },
    confidence: {
      composite: confidence.composite,
      ...confidence.signals,
    },
    strategy,
    variantMethod: variantResult.method,
  };
}

export { findCandidates } from './candidate-lookup.js';
export { validateName, jaroWinkler } from './name-validator.js';
export { validateExpansion } from './expansion-validator.js';
export { resolveVariant } from './variant-resolver.js';
export { computeConfidence } from './confidence-scorer.js';
export { classifyConfidence, passesGate } from './gates.js';
