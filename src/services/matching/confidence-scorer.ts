/**
 * Weighted geometric mean confidence scoring.
 * Pure function — no I/O.
 *
 * Geometric mean prevents one high score from masking a low one.
 * A single poor signal dimension drags down the composite significantly.
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
 * Weights from the spec (Section 4.5).
 */
const WEIGHTS: Record<keyof ConfidenceSignals, number> = {
  name: 0.30,
  denominator: 0.25,
  number: 0.15,
  expansion: 0.10,
  variant: 0.10,
  normalization: 0.10,
};

/**
 * Compute weighted geometric mean of confidence signals.
 *
 * Formula: exp(Σ(wi * ln(si)) / Σ(wi))
 * where wi = weight, si = signal score (clamped to [0.01, 1.0])
 */
export function computeConfidence(signals: ConfidenceSignals): ConfidenceResult {
  let weightedLogSum = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(WEIGHTS)) {
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
