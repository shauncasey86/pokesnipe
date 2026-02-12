/**
 * Weighted geometric mean confidence scoring.
 *
 * Geometric mean prevents one high score from masking a low one.
 * A single poor signal dimension drags down the composite significantly.
 *
 * Weights can be dynamically overridden by the calibration feedback loop.
 * Learned weights are loaded from the weight_overrides table at startup
 * and refreshed after each calibration run.
 */

export interface ConfidenceSignals {
  name: number;       // 0-1: name similarity score
  number: number;     // 0-1: card number match (1.0 if exact, 0.0 if no number)
  denominator: number; // 0-1: denominator/printed_total match
  expansion: number;  // 0-1: expansion name match
  variant: number;    // 0-1: variant resolution confidence
  normalization: number; // 0-1: signal extraction quality
}

export interface ConfidenceResult {
  composite: number;
  signals: ConfidenceSignals;
}

/**
 * Spec-defined default weights (Section 4.5).
 * Used when no calibration data exists.
 */
const SPEC_WEIGHTS: Record<keyof ConfidenceSignals, number> = {
  name: 0.30,
  denominator: 0.25,
  number: 0.15,
  expansion: 0.10,
  variant: 0.10,
  normalization: 0.10,
};

/** Active weights — starts as spec defaults, updated by loadLearnedWeights() */
let activeWeights: Record<keyof ConfidenceSignals, number> = { ...SPEC_WEIGHTS };

/**
 * Replace the active weights with learned weights from the calibrator.
 * Called at startup and after each calibration run.
 */
export function loadLearnedWeights(weights: Record<keyof ConfidenceSignals, number>): void {
  activeWeights = { ...weights };
}

/** Get the currently active weights (for API/diagnostics). */
export function getWeights(): Record<keyof ConfidenceSignals, number> {
  return { ...activeWeights };
}

/** Reset to spec defaults (for testing or manual override). */
export function resetWeights(): void {
  activeWeights = { ...SPEC_WEIGHTS };
}

/**
 * Compute weighted geometric mean of confidence signals.
 *
 * Formula: exp(Σ(wi * ln(si)) / Σ(wi))
 * where wi = weight, si = signal score (clamped to [0.01, 1.0])
 */
export function computeConfidence(signals: ConfidenceSignals): ConfidenceResult {
  let weightedLogSum = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(activeWeights)) {
    const score = Math.max(0.01, Math.min(1.0, signals[key as keyof ConfidenceSignals]));
    weightedLogSum += weight * Math.log(score);
    totalWeight += weight;
  }

  const composite = Math.exp(weightedLogSum / totalWeight);

  return {
    composite: Math.round(composite * 1000) / 1000, // 3 decimal places
    signals,
  };
}
