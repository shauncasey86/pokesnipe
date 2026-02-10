export type DealTier = 'GRAIL' | 'HIT' | 'FLIP' | 'SLEEP';
export type LiquidityGrade = 'high' | 'medium' | 'low' | 'illiquid';

/**
 * Adjust a deal's tier based on its liquidity grade.
 *
 * Rules:
 *   illiquid → always cap at SLEEP (can't resell, so profit is theoretical)
 *   low      → cap at FLIP (GRAIL→FLIP, HIT→FLIP, FLIP stays, SLEEP stays)
 *   medium   → GRAIL downgrades to HIT (GRAIL requires high liquidity)
 *   high     → no adjustment (liquid market supports the tier)
 *
 * The principle: GRAIL always implies both high profit AND high liquidity.
 */
export function adjustTierForLiquidity(tier: DealTier, grade: LiquidityGrade): DealTier {
  if (grade === 'illiquid') return 'SLEEP';
  if (grade === 'low' && (tier === 'GRAIL' || tier === 'HIT')) return 'FLIP';
  if (grade === 'medium' && tier === 'GRAIL') return 'HIT';
  return tier;
}
