import { pool } from '../../db/pool.js';
import type { CardNumber } from '../extraction/number-extractor.js';

type Condition = 'NM' | 'LP' | 'MP' | 'HP';

interface ConditionPrice {
  low: number;
  market: number;
}

export interface GradedPrice {
  low: number;
  market: number;
  mid?: number;
  high?: number;
}

export interface CardCandidate {
  scrydexCardId: string;
  name: string;
  number: string;
  numberNormalized: string;
  printedTotal: number;
  expansionId: string;
  expansionName: string;
  expansionCode: string;
  variants: Array<{
    id: number;
    name: string;
    prices: Record<string, Partial<Record<Condition, ConditionPrice>>>;
    gradedPrices: Record<string, GradedPrice> | null;
  }>;
}

interface CandidateRow {
  scrydex_card_id: string;
  name: string;
  number: string;
  number_normalized: string;
  printed_total: number;
  expansion_id: string;
  expansion_name: string;
  expansion_code: string;
  variant_id: number;
  variant_name: string;
  prices: Record<string, unknown>;
  graded_prices: Record<string, GradedPrice> | null;
}

function groupCandidates(rows: CandidateRow[]): CardCandidate[] {
  const map = new Map<string, CardCandidate>();

  for (const row of rows) {
    let card = map.get(row.scrydex_card_id);
    if (!card) {
      card = {
        scrydexCardId: row.scrydex_card_id,
        name: row.name,
        number: row.number,
        numberNormalized: row.number_normalized,
        printedTotal: row.printed_total,
        expansionId: row.expansion_id,
        expansionName: row.expansion_name,
        expansionCode: row.expansion_code,
        variants: [],
      };
      map.set(row.scrydex_card_id, card);
    }

    if (row.variant_id != null) {
      card.variants.push({
        id: row.variant_id,
        name: row.variant_name,
        prices: row.prices as Record<string, Partial<Record<Condition, ConditionPrice>>>,
        gradedPrices: row.graded_prices || null,
      });
    }
  }

  return Array.from(map.values());
}

const BASE_QUERY = `
  SELECT c.scrydex_card_id, c.name, c.number, c.number_normalized,
         c.printed_total, c.expansion_id, c.expansion_name, c.expansion_code,
         v.id AS variant_id, v.name AS variant_name, v.prices, v.graded_prices
  FROM cards c
  LEFT JOIN variants v ON v.card_id = c.scrydex_card_id
`;

/**
 * Strategy 1: Number + denominator match.
 * Most specific — e.g., card 4 in a set with 102 cards.
 */
async function lookupByNumberAndDenominator(
  cardNumber: CardNumber,
): Promise<CardCandidate[]> {
  if (cardNumber.denominator == null) return [];

  const { rows } = await pool.query<CandidateRow>(
    `${BASE_QUERY}
     WHERE c.number_normalized = $1 AND c.printed_total = $2`,
    [String(cardNumber.number), cardNumber.denominator],
  );
  return groupCandidates(rows);
}

/**
 * Strategy 2: Number + prefix match (for promo cards like SV001, SM60).
 */
async function lookupByNumberAndPrefix(
  cardNumber: CardNumber,
): Promise<CardCandidate[]> {
  if (!cardNumber.prefix) return [];

  // Promo card numbers are stored like "SM60", "SWSH050" etc.
  // number_normalized would be the full string for these
  const pattern = `${cardNumber.prefix}%`;
  const { rows } = await pool.query<CandidateRow>(
    `${BASE_QUERY}
     WHERE c.number_normalized = $1
        OR (c.number ILIKE $2 AND c.number_normalized = $1)`,
    [String(cardNumber.number), pattern],
  );
  return groupCandidates(rows);
}

/**
 * Strategy 3: Number only — broad search capped at 50 candidates.
 */
async function lookupByNumberOnly(
  cardNumber: CardNumber,
): Promise<CardCandidate[]> {
  const { rows } = await pool.query<CandidateRow>(
    `${BASE_QUERY}
     WHERE c.number_normalized = $1
     LIMIT 50`,
    [String(cardNumber.number)],
  );
  return groupCandidates(rows);
}

/**
 * Strategy 4: Name fallback via pg_trgm fuzzy search.
 * Used when no card number was extracted.
 */
async function lookupByName(
  cardName: string,
): Promise<CardCandidate[]> {
  const { rows } = await pool.query<CandidateRow>(
    `${BASE_QUERY}
     WHERE c.name % $1
     ORDER BY similarity(c.name, $1) DESC
     LIMIT 20`,
    [cardName],
  );
  return groupCandidates(rows);
}

/**
 * Find candidate cards from the database using the best available strategy.
 *
 * Priority:
 * 1. Number + denominator (most specific)
 * 2. Number + prefix (promo cards)
 * 3. Number only (broad, capped)
 * 4. Name search (last resort, pg_trgm)
 */
export async function findCandidates(
  cardNumber: CardNumber | null,
  cardName: string | null,
  setName: string | null,
): Promise<{ candidates: CardCandidate[]; strategy: string }> {
  // Strategy 1: Number + denominator
  if (cardNumber?.denominator != null) {
    const candidates = await lookupByNumberAndDenominator(cardNumber);
    if (candidates.length > 0) {
      return { candidates, strategy: 'number_denominator' };
    }
  }

  // Strategy 2: Number + prefix (promo cards)
  if (cardNumber?.prefix) {
    const candidates = await lookupByNumberAndPrefix(cardNumber);
    if (candidates.length > 0) {
      return { candidates, strategy: 'number_prefix' };
    }
  }

  // Strategy 3: Number only
  if (cardNumber) {
    let candidates = await lookupByNumberOnly(cardNumber);

    // If we also have set name, narrow down by expansion
    if (setName && candidates.length > 5) {
      const filtered = candidates.filter(
        (c) =>
          c.expansionName.toLowerCase().includes(setName.toLowerCase()) ||
          c.expansionCode.toLowerCase() === setName.toLowerCase(),
      );
      if (filtered.length > 0) candidates = filtered;
    }

    if (candidates.length > 0) {
      return { candidates, strategy: 'number_only' };
    }
  }

  // Strategy 4: Name fallback
  if (cardName) {
    const candidates = await lookupByName(cardName);
    if (candidates.length > 0) {
      return { candidates, strategy: 'name_fallback' };
    }
  }

  return { candidates: [], strategy: 'none' };
}
