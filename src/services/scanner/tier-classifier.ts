export type DealTier = 'GRAIL' | 'HIT' | 'FLIP' | 'SLEEP';

/**
 * Classify a deal into a tier based on profit % and confidence.
 *
 * Thresholds:
 *   GRAIL: >40% profit AND ≥0.85 confidence
 *   HIT:   >25% profit AND ≥0.65 confidence
 *   FLIP:  >15% profit (any confidence)
 *   SLEEP: 5-15% profit (any confidence)
 *
 * The liquidityGrade parameter is a placeholder for Stage 9.
 * In Stage 9, liquidity will further constrain tiers:
 *   illiquid → cap at SLEEP
 *   low → cap at FLIP
 *   medium → GRAIL downgrades to HIT
 */
export function classifyTier(
  profitPercent: number,
  confidence: number,
  _liquidityGrade: string,
): DealTier {
  if (profitPercent > 40 && confidence >= 0.85) return 'GRAIL';
  if (profitPercent > 25 && confidence >= 0.65) return 'HIT';
  if (profitPercent > 15) return 'FLIP';
  return 'SLEEP';
}
