/**
 * Confusion pair checker — prevents repeat incorrect matches.
 *
 * When a deal is reviewed as incorrect (wrong_card, wrong_set), the
 * (card_number, wrong_card_id) pair is recorded.  During candidate
 * scoring the matcher queries this table and applies a confidence
 * penalty to candidates that previously led to incorrect matches.
 *
 * If a reviewer also provides a correct_card_id, the matcher boosts
 * that candidate instead.
 */
import pino from 'pino';
import { pool } from '../../db/pool.js';

const log = pino({ name: 'confusion-checker' });

/** Penalty subtracted from candidate ranking score for known confusions */
export const CONFUSION_PENALTY = 0.15;

/** Boost added to candidate ranking score for known corrections */
export const CORRECTION_BOOST = 0.10;

export interface ConfusionRecord {
  wrongCardId: string;
  correctCardId: string | null;
  reason: string;
}

/**
 * Look up known confusion pairs for a given card number.
 * Returns a map of wrong_card_id → ConfusionRecord for fast lookup
 * during candidate scoring.
 */
export async function getConfusionsForNumber(
  cardNumberNorm: string,
): Promise<Map<string, ConfusionRecord>> {
  const map = new Map<string, ConfusionRecord>();

  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (wrong_card_id)
              wrong_card_id, correct_card_id, reason
       FROM confusion_pairs
       WHERE card_number_norm = $1
       ORDER BY wrong_card_id, created_at DESC`,
      [cardNumberNorm],
    );

    for (const row of rows) {
      map.set(row.wrong_card_id, {
        wrongCardId: row.wrong_card_id,
        correctCardId: row.correct_card_id,
        reason: row.reason,
      });
    }
  } catch (err) {
    // Table may not exist yet during initial migration
    log.warn({ err }, 'Could not query confusion_pairs');
  }

  return map;
}

/**
 * Record a new confusion pair when a deal is marked incorrect.
 *
 * Only records for actionable match reasons (wrong_card, wrong_set,
 * wrong_variant).  Non-match reasons (wrong_condition, wrong_price,
 * bad_image) are not stored because they don't indicate a matching error.
 */
export async function recordConfusion(opts: {
  cardNumberNorm: string;
  wrongCardId: string;
  correctCardId?: string | null;
  reason: string;
  dealId: string;
  ebayTitle: string;
  signals?: Record<string, number> | null;
}): Promise<void> {
  // Only record match-related reasons
  const matchReasons = ['wrong_card', 'wrong_set', 'wrong_variant'];
  if (!matchReasons.includes(opts.reason)) return;

  try {
    await pool.query(
      `INSERT INTO confusion_pairs
         (card_number_norm, wrong_card_id, correct_card_id, reason, deal_id, ebay_title, signals)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        opts.cardNumberNorm,
        opts.wrongCardId,
        opts.correctCardId || null,
        opts.reason,
        opts.dealId,
        opts.ebayTitle,
        opts.signals ? JSON.stringify(opts.signals) : null,
      ],
    );
    log.info({
      cardNumber: opts.cardNumberNorm,
      wrongCardId: opts.wrongCardId,
      correctCardId: opts.correctCardId,
      reason: opts.reason,
    }, 'Recorded confusion pair');
  } catch (err) {
    log.warn({ err }, 'Failed to record confusion pair');
  }
}
