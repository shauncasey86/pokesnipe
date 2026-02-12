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

interface ReviewedDeal {
  isCorrect: boolean;
  signals: ConfidenceSignals;
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
}

/**
 * Fetch all reviewed deals that have match_signals with confidence data.
 */
async function fetchReviewedDeals(): Promise<ReviewedDeal[]> {
  const { rows } = await pool.query(`
    SELECT
      is_correct_match,
      match_signals->'confidence'->'signals' as signals
    FROM deals
    WHERE status = 'reviewed'
      AND is_correct_match IS NOT NULL
      AND match_signals->'confidence'->'signals' IS NOT NULL
    ORDER BY reviewed_at DESC
  `);

  return rows
    .filter(r => r.signals && typeof r.signals === 'object')
    .map(r => ({
      isCorrect: r.is_correct_match,
      signals: r.signals as ConfidenceSignals,
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
 * Propose new weights based on signal separation analysis.
 *
 * Strategy: signals that discriminate well between correct/incorrect matches
 * get a weight boost; signals that don't discriminate get reduced.
 *
 * Uses the "separation" (correctMean - incorrectMean) as a measure of
 * predictive power. Higher separation = more useful signal = higher weight.
 *
 * Bounded to prevent catastrophic drift: each weight can only move ±MAX_DRIFT
 * from the spec default, and total weights are renormalized to 1.0.
 */
function proposeWeights(
  signalStats: Record<string, { correctMean: number; incorrectMean: number; separation: number }>,
  currentWeights: Record<keyof ConfidenceSignals, number>,
): Record<keyof ConfidenceSignals, number> {
  const proposed = { ...currentWeights };

  // Compute raw adjustment factors from separation
  // A positive separation (correct > incorrect) means the signal is useful
  // A negative separation (incorrect > correct) means the signal is misleading
  const separations = SIGNAL_KEYS.map(k => signalStats[k]?.separation ?? 0);
  const maxSep = Math.max(...separations.map(Math.abs), 0.01); // avoid div-by-zero

  for (const key of SIGNAL_KEYS) {
    const sep = signalStats[key]?.separation ?? 0;

    // Normalized adjustment: [-1, 1] range based on relative separation
    const normalizedAdj = sep / maxSep;

    // Scale to bounded drift: at most MAX_DRIFT absolute change
    // Use 60% of max drift to be conservative (don't always hit the limit)
    const adjustment = normalizedAdj * MAX_DRIFT * 0.6;

    // Blend: 70% current weight, 30% spec default, then apply adjustment
    // This pulls weights back toward spec over time (mean reversion)
    const blended = currentWeights[key] * 0.7 + SPEC_WEIGHTS[key] * 0.3;
    proposed[key] = Math.max(MIN_WEIGHT, blended + adjustment);

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
    // Add/subtract the rounding error to the largest weight
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
 * 1. Fetch all reviewed deals with signal data
 * 2. Compute signal-level statistics (mean scores for correct vs incorrect)
 * 3. Propose new weights based on signal discrimination power
 * 4. Evaluate: do new weights improve accuracy on the review corpus?
 * 5. If yes AND improvement > 0.5%, persist the new weights
 * 6. If no, keep current weights (do nothing)
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

  // Propose new weights
  const newWeights = proposeWeights(signalStats, currentWeights);
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
      }),
    ],
  );

  log.info({
    improvement,
    accuracyBefore,
    accuracyAfter,
    newWeights,
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
  };
}

/** Spec defaults, exported for reference */
export const SPEC_DEFAULT_WEIGHTS = { ...SPEC_WEIGHTS };
