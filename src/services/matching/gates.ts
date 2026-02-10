/**
 * Confidence gates — accept/reject thresholds for matches.
 * Pure function — no I/O.
 */

export type ConfidenceTier = 'high' | 'medium' | 'low' | 'reject';

/**
 * Classify a confidence score into a tier.
 *
 * | Composite | Tier   | Action                                  |
 * |-----------|--------|-----------------------------------------|
 * | >= 0.85   | high   | Process automatically, show in dashboard |
 * | 0.65-0.84 | medium | Process but flag with warning badge      |
 * | 0.45-0.64 | low    | Log for training only, do not display    |
 * | < 0.45    | reject | Skip entirely                            |
 */
export function classifyConfidence(composite: number): ConfidenceTier {
  if (composite >= 0.85) return 'high';
  if (composite >= 0.65) return 'medium';
  if (composite >= 0.45) return 'low';
  return 'reject';
}

/**
 * Should this match be processed (not rejected)?
 * Returns true for high, medium, and low tiers.
 * Only rejects matches below 0.45 composite confidence.
 */
export function passesGate(composite: number): boolean {
  return composite >= 0.45;
}
