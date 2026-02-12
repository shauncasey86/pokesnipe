/**
 * Learned junk scorer — applies soft confidence penalties based on
 * user-reported junk listings.
 *
 * Two prongs:
 * 1. Learned keywords: novel tokens from junk titles (words NOT in the card
 *    catalog) are matched against future listings. If any hit → penalty.
 * 2. Seller reputation: sellers with ≥3 junk reports get a penalty that
 *    scales with report count.
 *
 * Both are soft penalties (subtracted from confidence), NOT hard blocks.
 * A genuinely good deal with strong match signals can still overcome them.
 */
import pino from 'pino';
import { pool } from '../../db/pool.js';

const log = pino({ name: 'junk-scorer' });

/** Confidence penalty when a learned keyword is found in a listing title */
export const LEARNED_KEYWORD_PENALTY = 0.15;

/** Confidence penalty per seller junk report (above the threshold) */
export const SELLER_PENALTY_PER_REPORT = 0.05;

/** Minimum reports before a seller starts receiving penalties */
export const SELLER_PENALTY_THRESHOLD = 3;

/** Maximum seller penalty (cap to prevent permanent blocking) */
export const SELLER_PENALTY_CAP = 0.20;

// ── In-memory caches ────────────────────────────────────────────────

/** Set of learned junk keywords (lowercased), refreshed periodically */
let learnedKeywords = new Set<string>();

/** Map of seller_name → report count, refreshed periodically */
let sellerReportCounts = new Map<string, number>();

/** Timestamp of last cache refresh */
let lastRefresh = 0;

/** Refresh interval: 30 minutes */
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Refresh the in-memory caches from the database.
 * Called lazily on first score request and then every REFRESH_INTERVAL_MS.
 */
export async function refreshJunkCaches(): Promise<void> {
  try {
    // Load all learned tokens
    const { rows: tokenRows } = await pool.query(
      `SELECT DISTINCT unnest(learned_tokens) AS token FROM junk_reports`,
    );
    const newKeywords = new Set<string>();
    for (const row of tokenRows) {
      newKeywords.add(row.token.toLowerCase());
    }
    learnedKeywords = newKeywords;

    // Load seller report counts
    const { rows: sellerRows } = await pool.query(
      `SELECT seller_name, COUNT(*) AS cnt
       FROM junk_reports
       WHERE seller_name IS NOT NULL
       GROUP BY seller_name
       HAVING COUNT(*) >= $1`,
      [SELLER_PENALTY_THRESHOLD],
    );
    const newSellerCounts = new Map<string, number>();
    for (const row of sellerRows) {
      newSellerCounts.set(row.seller_name, parseInt(row.cnt));
    }
    sellerReportCounts = newSellerCounts;

    lastRefresh = Date.now();
    log.info(
      { keywords: learnedKeywords.size, flaggedSellers: sellerReportCounts.size },
      'Junk scorer caches refreshed',
    );
  } catch (err) {
    // Table may not exist yet during initial migration
    log.warn({ err }, 'Could not refresh junk scorer caches');
  }
}

async function ensureCachesFresh(): Promise<void> {
  if (Date.now() - lastRefresh > REFRESH_INTERVAL_MS) {
    await refreshJunkCaches();
  }
}

export interface JunkScoreResult {
  /** Total confidence penalty to subtract (0 = no junk signals) */
  penalty: number;
  /** Which learned keywords matched */
  matchedKeywords: string[];
  /** Seller junk report count (0 if below threshold or unknown seller) */
  sellerReportCount: number;
}

/**
 * Score a listing for learned junk signals.
 * Returns a penalty to subtract from the confidence composite.
 */
export async function scoreJunkSignals(
  cleanedTitle: string,
  sellerName: string | null | undefined,
): Promise<JunkScoreResult> {
  await ensureCachesFresh();

  const result: JunkScoreResult = {
    penalty: 0,
    matchedKeywords: [],
    sellerReportCount: 0,
  };

  // Prong 1: Learned keyword matching
  if (learnedKeywords.size > 0) {
    const titleWords = cleanedTitle.toLowerCase().split(/\s+/);
    for (const word of titleWords) {
      if (learnedKeywords.has(word)) {
        result.matchedKeywords.push(word);
      }
    }
    if (result.matchedKeywords.length > 0) {
      result.penalty += LEARNED_KEYWORD_PENALTY;
    }
  }

  // Prong 2: Seller reputation
  if (sellerName && sellerReportCounts.has(sellerName)) {
    const count = sellerReportCounts.get(sellerName)!;
    result.sellerReportCount = count;
    // Penalty scales with how many reports over the threshold
    const sellerPenalty = Math.min(
      SELLER_PENALTY_CAP,
      (count - SELLER_PENALTY_THRESHOLD + 1) * SELLER_PENALTY_PER_REPORT,
    );
    result.penalty += sellerPenalty;
  }

  if (result.penalty > 0) {
    log.debug(
      {
        penalty: result.penalty,
        keywords: result.matchedKeywords,
        seller: sellerName,
        sellerReports: result.sellerReportCount,
      },
      'Junk score applied',
    );
  }

  return result;
}

// ── Token extraction (used when recording a junk report) ────────────

/** Common Pokémon card terms to exclude from learned tokens */
const STOP_WORDS = new Set([
  // Generic listing words
  'pokemon', 'pokémon', 'card', 'cards', 'tcg', 'trading', 'game',
  'mint', 'near', 'lightly', 'moderately', 'heavily', 'played', 'damaged',
  'nm', 'lp', 'mp', 'hp', 'dm',
  'psa', 'cgc', 'bgs', 'ace', 'graded',
  'holo', 'holofoil', 'holographic', 'reverse', 'full', 'art', 'rare',
  'ultra', 'secret', 'amazing', 'radiant', 'illustration', 'special',
  'ex', 'gx', 'vmax', 'vstar', 'v', 'tag', 'team', 'mega', 'break',
  'trainer', 'gallery', 'promo',
  // Numbers and short tokens are excluded by length check below
  // Common eBay terms
  'free', 'postage', 'shipping', 'uk', 'p&p', 'post', 'delivery',
  'new', 'sealed', 'pack', 'fresh',
]);

/**
 * Extract novel tokens from a junk listing title by subtracting known
 * card names, expansion names, numbers, and common stop words.
 *
 * Only tokens that aren't in the card catalog are returned — these are
 * the junk-specific words that are safe to match against future listings.
 */
export async function extractNovelTokens(
  cleanedTitle: string,
  cardId: string | null,
): Promise<string[]> {
  const words = cleanedTitle
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length >= 3); // Ignore very short tokens

  // Remove stop words
  const afterStopWords = words.filter(w => !STOP_WORDS.has(w));

  if (afterStopWords.length === 0) return [];

  // Remove card name words and expansion name words from the catalog
  const catalogWords = new Set<string>();

  try {
    // If we have the matched card, get its name + expansion
    if (cardId) {
      const { rows } = await pool.query(
        `SELECT c.name, e.name AS exp_name, e.code AS exp_code
         FROM cards c
         LEFT JOIN expansions e ON e.scrydex_id = c.expansion_id
         WHERE c.scrydex_card_id = $1`,
        [cardId],
      );
      if (rows.length > 0) {
        for (const word of rows[0].name.toLowerCase().split(/\s+/)) {
          catalogWords.add(word);
        }
        if (rows[0].exp_name) {
          for (const word of rows[0].exp_name.toLowerCase().split(/\s+/)) {
            catalogWords.add(word);
          }
        }
        if (rows[0].exp_code) {
          catalogWords.add(rows[0].exp_code.toLowerCase());
        }
      }
    }

    // Also remove any word that appears as a card name in the catalog
    // (batch check for efficiency)
    if (afterStopWords.length > 0) {
      const { rows: nameHits } = await pool.query(
        `SELECT DISTINCT lower(unnest(string_to_array(name, ' '))) AS word
         FROM cards
         WHERE lower(name) LIKE ANY($1)
         LIMIT 500`,
        [afterStopWords.map(w => `%${w}%`)],
      );
      for (const row of nameHits) {
        catalogWords.add(row.word);
      }
    }
  } catch (err) {
    log.warn({ err }, 'Could not query catalog for token extraction');
  }

  // Remove numbers (card numbers, prices, quantities)
  const isNumeric = (s: string) => /^\d+([/.-]\d+)?$/.test(s);

  return afterStopWords.filter(w => !catalogWords.has(w) && !isNumeric(w));
}

/**
 * Record a junk report: extract novel tokens and store in junk_reports.
 */
export async function recordJunkReport(opts: {
  dealId: string;
  ebayItemId: string;
  ebayTitle: string;
  sellerName: string | null;
  cardId: string | null;
}): Promise<{ learnedTokens: string[] }> {
  const learnedTokens = await extractNovelTokens(
    opts.ebayTitle.toLowerCase(),
    opts.cardId,
  );

  await pool.query(
    `INSERT INTO junk_reports (deal_id, ebay_item_id, ebay_title, seller_name, learned_tokens)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (deal_id) DO NOTHING`,
    [opts.dealId, opts.ebayItemId, opts.ebayTitle, opts.sellerName, learnedTokens],
  );

  log.info(
    {
      dealId: opts.dealId,
      seller: opts.sellerName,
      learnedTokens,
      tokenCount: learnedTokens.length,
    },
    'Junk report recorded',
  );

  // Force cache refresh so the new tokens take effect next cycle
  lastRefresh = 0;

  return { learnedTokens };
}

/** Reset caches (for testing) */
export function _resetCaches(): void {
  learnedKeywords = new Set();
  sellerReportCounts = new Map();
  lastRefresh = 0;
}
