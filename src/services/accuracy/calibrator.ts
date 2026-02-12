import pino from 'pino';
import { pool } from '../../db/pool.js';
import type { ConfidenceSignals } from '../matching/confidence-scorer.js';

const log = pino({ name: 'calibrator' });

/** Spec-defined default weights (Section 4.5). Always the baseline. */
const SPEC_WEIGHTS: Record<keyof ConfidenceSignals, number> = {
  name: 0.30,
  denominator: 0.25,
  number: 0.15,
  expansion: 0.10,
  variant: 0.10,
  normalization: 0.10,
};

const SIGNAL_KEYS: (keyof ConfidenceSignals)[] = [
  'name', 'denominator', 'number', 'expansion', 'variant', 'normalization',
];

/** Minimum reviewed deals required to run calibration */
const MIN_SAMPLE_SIZE = 20;

/** Maximum a single weight can drift from spec (±0.10 absolute) */
const MAX_DRIFT = 0.10;

/** Minimum weight for any signal (prevents zeroing out a dimension) */
const MIN_WEIGHT = 0.03;

/** Minimum incorrect deals with a specific reason to apply targeted penalty */
const MIN_REASON_SAMPLE = 3;

/**
 * Maps incorrect_reason → the signal dimensions that are implicated.
 * Non-match reasons (wrong_condition, wrong_price, bad_image) are excluded
 * because they don't indicate a matching/confidence problem.
 */
const REASON_SIGNAL_MAP: Record<string, (keyof ConfidenceSignals)[]> = {
  wrong_card: ['name', 'number'],
  wrong_set: ['expansion', 'denominator'],
  wrong_variant: ['variant'],
};

interface ReviewedDeal {
  isCorrect: boolean;
  signals: ConfidenceSignals;
  incorrectReason: string | null;
}

interface CalibrationResult {
  applied: boolean;
  reason: string;
  sampleSize: number;
  accuracyBefore: number;
  accuracyAfter: number;
  oldWeights: Record<string, number>;
  newWeights: Record<string, number>;
  signalStats: Record<string, { correctMean: number; incorrectMean: number; separation: number }>;
  reasonStats?: Record<string, { count: number; targetedSignals: string[]; applied: boolean }>;
}

/**
 * Fetch all reviewed deals that have match_signals with confidence data.
 * Now also fetches incorrect_reason for reason-aware calibration.
 */
async function fetchReviewedDeals(): Promise<ReviewedDeal[]> {
  const { rows } = await pool.query(`
    SELECT
      is_correct_match,
      incorrect_reason,
      match_signals->'confidence'->'signals' as signals
    FROM deals
    WHERE (status = 'reviewed' OR (status = 'active' AND is_correct_match = TRUE))
      AND is_correct_match IS NOT NULL
      AND match_signals->'confidence'->'signals' IS NOT NULL
    ORDER BY reviewed_at DESC
  `);

  return rows
    .filter(r => r.signals && typeof r.signals === 'object')
    .map(r => ({
      isCorrect: r.is_correct_match,
      signals: r.signals as ConfidenceSignals,
      incorrectReason: r.incorrect_reason || null,
    }));
}

/**
 * Compute the weighted geometric mean for a deal given specific weights.
 * Same formula as computeConfidence() in confidence-scorer.ts.
 */
function weightedGeometricMean(
  signals: ConfidenceSignals,
  weights: Record<keyof ConfidenceSignals, number>,
): number {
  let weightedLogSum = 0;
  let totalWeight = 0;

  for (const key of SIGNAL_KEYS) {
    const score = Math.max(0.01, Math.min(1.0, signals[key]));
    weightedLogSum += weights[key] * Math.log(score);
    totalWeight += weights[key];
  }

  return Math.exp(weightedLogSum / totalWeight);
}

/**
 * Evaluate accuracy: what % of reviewed deals would be correctly classified
 * using a 0.65 threshold (deal creation gate) with the given weights?
 *
 * "Correctly classified" means:
 *   - correct match AND composite >= 0.65 (true positive)
 *   - incorrect match AND composite < 0.65 (true negative — would have been filtered)
 */
function evaluateAccuracy(
  deals: ReviewedDeal[],
  weights: Record<keyof ConfidenceSignals, number>,
): number {
  if (deals.length === 0) return 0;

  let correct = 0;
  for (const deal of deals) {
    const composite = weightedGeometricMean(deal.signals, weights);
    const wouldCreate = composite >= 0.65;

    if (deal.isCorrect && wouldCreate) correct++;       // true positive
    if (!deal.isCorrect && !wouldCreate) correct++;      // true negative (caught by gate)
  }

  return (correct / deals.length) * 100;
}

/**
 * Compute signal-level statistics: mean score for correct vs incorrect matches.
 * Signals with high separation (correct mean >> incorrect mean) are more predictive.
 */
function computeSignalStats(deals: ReviewedDeal[]) {
  const stats: Record<string, { correctMean: number; incorrectMean: number; separation: number }> = {};

  for (const key of SIGNAL_KEYS) {
    const correctScores = deals.filter(d => d.isCorrect).map(d => d.signals[key]);
    const incorrectScores = deals.filter(d => !d.isCorrect).map(d => d.signals[key]);

    const correctMean = correctScores.length > 0
      ? correctScores.reduce((a, b) => a + b, 0) / correctScores.length
      : 0;
    const incorrectMean = incorrectScores.length > 0
      ? incorrectScores.reduce((a, b) => a + b, 0) / incorrectScores.length
      : 0;

    stats[key] = {
      correctMean: Math.round(correctMean * 1000) / 1000,
      incorrectMean: Math.round(incorrectMean * 1000) / 1000,
      separation: Math.round((correctMean - incorrectMean) * 1000) / 1000,
    };
  }

  return stats;
}

/**
 * Compute reason-aware adjustments.
 *
 * Groups incorrect deals by their reason and computes a targeted penalty
 * for the signal dimensions that are implicated by that reason.
 *
 * For example, if 5 deals are marked "wrong_set", their expansion and
 * denominator signal scores are averaged. If those averages are HIGH
 * (the signals looked confident but were wrong), the signals get a
 * stronger downward adjustment.
 *
 * Returns per-signal adjustment values in [-0.06, 0] that should be
 * ADDED to the base separation-derived adjustments.
 */
function computeReasonPenalties(
  deals: ReviewedDeal[],
): { penalties: Record<keyof ConfidenceSignals, number>; reasonStats: Record<string, { count: number; targetedSignals: string[]; applied: boolean }> } {
  const penalties: Record<keyof ConfidenceSignals, number> = {
    name: 0, denominator: 0, number: 0, expansion: 0, variant: 0, normalization: 0,
  };
  const reasonStats: Record<string, { count: number; targetedSignals: string[]; applied: boolean }> = {};

  const incorrectDeals = deals.filter(d => !d.isCorrect && d.incorrectReason);

  // Group by reason
  const byReason = new Map<string, ReviewedDeal[]>();
  for (const deal of incorrectDeals) {
    const reason = deal.incorrectReason!;
    if (!byReason.has(reason)) byReason.set(reason, []);
    byReason.get(reason)!.push(deal);
  }

  for (const [reason, reasonDeals] of byReason) {
    const targetSignals = REASON_SIGNAL_MAP[reason];
    reasonStats[reason] = {
      count: reasonDeals.length,
      targetedSignals: targetSignals ? [...targetSignals] : [],
      applied: false,
    };

    if (!targetSignals || reasonDeals.length < MIN_REASON_SAMPLE) continue;

    // For each targeted signal, compute the mean score among these
    // incorrect deals.  If the signal was HIGH but the match was wrong,
    // that signal was misleading and deserves a penalty.
    for (const signalKey of targetSignals) {
      const scores = reasonDeals.map(d => d.signals[signalKey]);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;

      // Penalty scales with how misleadingly high the signal was.
      // A mean of 0.90 (very misleading) → penalty of -0.054
      // A mean of 0.50 (ambiguous) → penalty of -0.030
      // A mean of 0.20 (already low) → penalty of -0.012
      // Cap at -0.06 to prevent over-correction.
      const penalty = -Math.min(0.06, mean * 0.06);
      penalties[signalKey] += penalty;
    }

    reasonStats[reason].applied = true;
  }

  return { penalties, reasonStats };
}

/**
 * Propose new weights based on signal separation analysis,
 * enhanced with reason-aware penalties.
 *
 * Strategy:
 * 1. Compute base adjustments from global signal separation (as before)
 * 2. Layer on reason-aware penalties for signals implicated by specific
 *    error types (wrong_card → name/number, wrong_set → expansion/denom)
 * 3. Bound, clamp, and renormalize
 */
function proposeWeights(
  signalStats: Record<string, { correctMean: number; incorrectMean: number; separation: number }>,
  currentWeights: Record<keyof ConfidenceSignals, number>,
  reasonPenalties: Record<keyof ConfidenceSignals, number>,
): Record<keyof ConfidenceSignals, number> {
  const proposed = { ...currentWeights };

  const separations = SIGNAL_KEYS.map(k => signalStats[k]?.separation ?? 0);
  const maxSep = Math.max(...separations.map(Math.abs), 0.01);

  for (const key of SIGNAL_KEYS) {
    const sep = signalStats[key]?.separation ?? 0;

    // Base adjustment from global signal separation
    const normalizedAdj = sep / maxSep;
    const baseAdjustment = normalizedAdj * MAX_DRIFT * 0.6;

    // Reason-aware penalty (negative or zero)
    const reasonAdj = reasonPenalties[key];

    // Combined adjustment: base + targeted reason penalty
    const totalAdjustment = baseAdjustment + reasonAdj;

    // Blend: 70% current weight, 30% spec default, then apply adjustment
    const blended = currentWeights[key] * 0.7 + SPEC_WEIGHTS[key] * 0.3;
    proposed[key] = Math.max(MIN_WEIGHT, blended + totalAdjustment);

    // Hard clamp: never drift more than MAX_DRIFT from spec
    proposed[key] = Math.max(
      SPEC_WEIGHTS[key] - MAX_DRIFT,
      Math.min(SPEC_WEIGHTS[key] + MAX_DRIFT, proposed[key]),
    );
  }

  // Renormalize to sum to 1.0
  const total = SIGNAL_KEYS.reduce((s, k) => s + proposed[k], 0);
  for (const key of SIGNAL_KEYS) {
    proposed[key] = Math.round((proposed[key] / total) * 1000) / 1000;
  }

  // Fix rounding: ensure exact 1.0 sum
  const roundedTotal = SIGNAL_KEYS.reduce((s, k) => s + proposed[k], 0);
  const diff = Math.round((1.0 - roundedTotal) * 1000) / 1000;
  if (diff !== 0) {
    const largestKey = SIGNAL_KEYS.reduce((a, b) => proposed[a] >= proposed[b] ? a : b);
    proposed[largestKey] = Math.round((proposed[largestKey] + diff) * 1000) / 1000;
  }

  return proposed;
}

/**
 * Get the currently active weights (learned or spec defaults).
 */
export async function getActiveWeights(): Promise<Record<keyof ConfidenceSignals, number>> {
  try {
    const { rows } = await pool.query(
      `SELECT weights FROM weight_overrides ORDER BY calibrated_at DESC LIMIT 1`,
    );
    if (rows.length > 0 && rows[0].weights) {
      const w = rows[0].weights as Record<string, number>;
      // Validate all keys exist and are numbers
      const valid = SIGNAL_KEYS.every(k => typeof w[k] === 'number' && w[k] > 0);
      if (valid) return w as Record<keyof ConfidenceSignals, number>;
    }
  } catch {
    // Table might not exist yet — fall through to defaults
  }
  return { ...SPEC_WEIGHTS };
}

/**
 * Run the calibration loop.
 *
 * 1. Fetch all reviewed deals with signal data and incorrect reasons
 * 2. Compute signal-level statistics (mean scores for correct vs incorrect)
 * 3. Compute reason-aware penalties (targeted adjustments per error type)
 * 4. Propose new weights combining global separation + reason penalties
 * 5. Evaluate: do new weights improve accuracy on the review corpus?
 * 6. If yes AND improvement > 0.5%, persist the new weights
 * 7. If no, keep current weights (do nothing)
 */
export async function runCalibration(): Promise<CalibrationResult> {
  const deals = await fetchReviewedDeals();

  if (deals.length < MIN_SAMPLE_SIZE) {
    return {
      applied: false,
      reason: `Insufficient data: ${deals.length} reviewed deals (need ${MIN_SAMPLE_SIZE})`,
      sampleSize: deals.length,
      accuracyBefore: 0,
      accuracyAfter: 0,
      oldWeights: { ...SPEC_WEIGHTS },
      newWeights: { ...SPEC_WEIGHTS },
      signalStats: {},
    };
  }

  const correctCount = deals.filter(d => d.isCorrect).length;
  const incorrectCount = deals.filter(d => !d.isCorrect).length;

  // Need at least some incorrect deals to learn from
  if (incorrectCount < 3) {
    return {
      applied: false,
      reason: `Insufficient negative examples: ${incorrectCount} incorrect deals (need 3)`,
      sampleSize: deals.length,
      accuracyBefore: 0,
      accuracyAfter: 0,
      oldWeights: { ...SPEC_WEIGHTS },
      newWeights: { ...SPEC_WEIGHTS },
      signalStats: {},
    };
  }

  // Get current weights (may be spec defaults or previous calibration)
  const currentWeights = await getActiveWeights();
  const signalStats = computeSignalStats(deals);
  const accuracyBefore = evaluateAccuracy(deals, currentWeights);

  // Compute reason-aware penalties
  const { penalties: reasonPenalties, reasonStats } = computeReasonPenalties(deals);

  // Propose new weights (global separation + reason-aware penalties)
  const newWeights = proposeWeights(signalStats, currentWeights, reasonPenalties);
  const accuracyAfter = evaluateAccuracy(deals, newWeights);

  const improvement = accuracyAfter - accuracyBefore;

  log.info({
    sampleSize: deals.length,
    correct: correctCount,
    incorrect: incorrectCount,
    accuracyBefore,
    accuracyAfter,
    improvement,
    signalStats,
    reasonPenalties,
    reasonStats,
    currentWeights,
    newWeights,
  }, 'Calibration analysis complete');

  // Only apply if the new weights actually improve accuracy by >0.5%
  if (improvement <= 0.5) {
    return {
      applied: false,
      reason: improvement <= 0
        ? `New weights would not improve accuracy (${accuracyBefore}% → ${accuracyAfter}%)`
        : `Improvement too small: +${improvement.toFixed(1)}% (need >0.5%)`,
      sampleSize: deals.length,
      accuracyBefore,
      accuracyAfter,
      oldWeights: currentWeights,
      newWeights,
      signalStats,
      reasonStats,
    };
  }

  // Persist the new weights
  await pool.query(
    `INSERT INTO weight_overrides (weights, baseline_weights, sample_size, accuracy_before, accuracy_after, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      JSON.stringify(newWeights),
      JSON.stringify(currentWeights),
      deals.length,
      accuracyBefore,
      accuracyAfter,
      JSON.stringify({
        correct_count: correctCount,
        incorrect_count: incorrectCount,
        improvement,
        signal_stats: signalStats,
        reason_penalties: reasonPenalties,
        reason_stats: reasonStats,
      }),
    ],
  );

  log.info({
    improvement,
    accuracyBefore,
    accuracyAfter,
    newWeights,
    reasonStats,
  }, 'Calibration applied — new weights persisted');

  return {
    applied: true,
    reason: `Improved accuracy by +${improvement.toFixed(1)}% (${accuracyBefore}% → ${accuracyAfter}%)`,
    sampleSize: deals.length,
    accuracyBefore,
    accuracyAfter,
    oldWeights: currentWeights,
    newWeights,
    signalStats,
    reasonStats,
  };
}

/** Spec defaults, exported for reference */
export const SPEC_DEFAULT_WEIGHTS = { ...SPEC_WEIGHTS };
