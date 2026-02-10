import { scoreTrendActivity, scorePriceCompleteness, scorePriceSpread } from './tier1-signals.js';
import { scoreSupply, scoreSold } from './tier2-signals.js';
import { scoreVelocity, VelocityData } from './velocity-scorer.js';

export interface LiquiditySignals {
  trendActivity: number;
  priceCompleteness: number;
  priceSpread: number;
  supply: number;
  sold: number;
  velocity: number | null;  // null if velocity was not fetched
}

export interface LiquidityAssessment {
  composite: number;
  grade: 'high' | 'medium' | 'low' | 'illiquid';
  signals: LiquiditySignals;
}

/**
 * Calculate composite liquidity score.
 *
 * Uses weighted arithmetic mean (not geometric — see rationale below).
 *
 * Weights with velocity data:
 *   Tier 1 (free):    trend 0.15, prices 0.10, spread 0.10 = 0.35
 *   Tier 2 (free):    supply 0.15, sold 0.10              = 0.25
 *   Tier 3 (premium): velocity 0.40                       = 0.40
 *   Total = 1.00
 *
 * Weights without velocity data (redistributed):
 *   Tier 1 (free):    trend 0.25, prices 0.15, spread 0.15 = 0.55
 *   Tier 2 (free):    supply 0.25, sold 0.20               = 0.45
 *   Total = 1.00
 *
 * Why arithmetic mean (not geometric)?
 *   Confidence uses geometric mean because any single wrong field (wrong name,
 *   wrong set) means a wrong card — one low score should tank the composite.
 *   Liquidity uses arithmetic mean because a card can have zero eBay supply
 *   (nobody listing right now) but strong Scrydex trend activity — it's still
 *   liquid, just not on eBay this moment. Strong signals compensate for weak ones.
 */
export function compositeScore(signals: LiquiditySignals): number {
  const hasVelocity = signals.velocity !== null;

  const weights = hasVelocity
    ? { trend: 0.15, prices: 0.10, spread: 0.10, supply: 0.15, sold: 0.10, velocity: 0.40 }
    : { trend: 0.25, prices: 0.15, spread: 0.15, supply: 0.25, sold: 0.20, velocity: 0.00 };

  const composite =
    weights.trend * signals.trendActivity +
    weights.prices * signals.priceCompleteness +
    weights.spread * signals.priceSpread +
    weights.supply * signals.supply +
    weights.sold * signals.sold +
    weights.velocity * (signals.velocity ?? 0);

  return Math.round(composite * 1000) / 1000; // 3 decimal places
}

/**
 * Assign a liquidity grade from composite score.
 *
 * Thresholds:
 *   >=0.75 → high     (actively traded, easy to resell)
 *   >=0.50 → medium   (moderate demand)
 *   >=0.25 → low      (thin market, may take time to sell)
 *   <0.25  → illiquid  (very few buyers, hard to sell)
 */
export function assignGrade(score: number): 'high' | 'medium' | 'low' | 'illiquid' {
  if (score >= 0.75) return 'high';
  if (score >= 0.50) return 'medium';
  if (score >= 0.25) return 'low';
  return 'illiquid';
}

/**
 * Full liquidity assessment — convenience function that computes all signals
 * and returns the composite score + grade.
 *
 * @param variant - The matched variant (with prices and trends data)
 * @param condition - The listing's condition (NM/LP/MP/HP)
 * @param ebaySignals - eBay-derived signals { concurrentSupply, quantitySold }
 * @param velocityData - Tier 3 velocity data (null if not fetched)
 */
export function calculateLiquidity(
  variant: { prices: Record<string, any>; trends?: Record<string, any> },
  condition: string,
  ebaySignals: { concurrentSupply: number; quantitySold: number },
  velocityData: VelocityData | null
): LiquidityAssessment {
  const signals: LiquiditySignals = {
    trendActivity: scoreTrendActivity(variant.trends?.[condition]),
    priceCompleteness: scorePriceCompleteness(variant.prices),
    priceSpread: scorePriceSpread(variant.prices, condition),
    supply: scoreSupply(ebaySignals.concurrentSupply),
    sold: scoreSold(ebaySignals.quantitySold),
    velocity: velocityData?.fetched ? scoreVelocity(velocityData) : null,
  };

  const score = compositeScore(signals);
  const grade = assignGrade(score);

  return { composite: score, grade, signals };
}
