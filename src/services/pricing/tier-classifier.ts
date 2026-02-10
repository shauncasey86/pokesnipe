export type DealTier = 'GRAIL' | 'HIT' | 'FLIP' | 'SLEEP';

/**
 * Classify a deal based on profit percentage.
 *
 * | Tier    | Profit %  |
 * |---------|-----------|
 * | GRAIL   | >40%      |
 * | HIT     | 25-40%    |
 * | FLIP    | 15-25%    |
 * | SLEEP   | 5-15%     |
 * | (null)  | <5%       |
 */
export function classifyTier(profitPercent: number): DealTier | null {
  if (profitPercent > 40) return 'GRAIL';
  if (profitPercent > 25) return 'HIT';
  if (profitPercent > 15) return 'FLIP';
  if (profitPercent >= 5) return 'SLEEP';
  return null;
}
