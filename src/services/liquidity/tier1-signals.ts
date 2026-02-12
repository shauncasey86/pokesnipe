/**
 * Tier 1 Liquidity Signals — Free (from synced card data)
 *
 * These signals use data already in the database from the Scrydex card sync.
 * No API calls required.
 */

/**
 * Score trend activity: how many trend windows show non-zero price movement?
 * More movement = more actively traded = more liquid.
 *
 * Checks 6 windows: 1d, 7d, 14d, 30d, 90d, 180d
 * Score = count of non-zero windows / 6
 *
 * @param trends - The variant's trends data for a specific condition (e.g. trends.NM)
 *   Shape: { '1d': { percent_change: number }, '7d': { ... }, ... }
 * @returns Score 0.0–1.0
 */
export function scoreTrendActivity(trends: Record<string, any> | null | undefined): number {
  if (!trends) return 0;

  const windows = ['1d', '7d', '14d', '30d', '90d', '180d'];
  const activeWindows = windows.filter(w => {
    const pct = trends[w]?.percent_change ?? trends[w]?.pct;
    return pct !== null && pct !== undefined && pct !== 0;
  });

  return activeWindows.length / windows.length;
}

/**
 * Score price completeness: how many conditions (NM/LP/MP/HP) have market pricing?
 * Also considers graded prices as a bonus signal.
 * More conditions priced = more widely traded = more liquid.
 *
 * @param prices - The variant's prices object
 *   Shape: { NM: { market: number, low: number }, LP: { ... }, MP: { ... }, HP: { ... } }
 * @param gradedPrices - Optional graded prices { PSA_10: { market: ... }, ... }
 * @returns Score 0.0–1.0 (0.25 per raw condition, graded data adds up to 0.25 bonus)
 */
export function scorePriceCompleteness(
  prices: Record<string, any> | null | undefined,
  gradedPrices?: Record<string, any> | null,
): number {
  if (!prices) return 0;

  const conditions = ['NM', 'LP', 'MP', 'HP'];
  const pricedCount = conditions.filter(c =>
    prices[c]?.market != null && prices[c].market > 0
  ).length;

  let rawScore = pricedCount / conditions.length;

  // Bonus for graded price data (signals an actively graded/traded card)
  if (gradedPrices) {
    const gradedCount = Object.values(gradedPrices).filter(
      (p: any) => p?.market != null && p.market > 0
    ).length;
    if (gradedCount > 0) {
      rawScore = Math.min(rawScore + 0.25, 1.0);
    }
  }

  return rawScore;
}

/**
 * Score price spread: how tight is the low-to-market spread for this condition?
 * Tight spread (low ≈ market) = 1.0 — liquid, prices are stable
 * Wide spread (low << market) = lower score — volatile or thin market
 *
 * @param prices - The variant's prices object
 * @param condition - The condition to check (NM/LP/MP/HP/DM)
 * @param gradedPrices - Optional graded prices for fallback spread check
 * @returns Score 0.0–1.0 (defaults to 0.3 if data missing)
 */
export function scorePriceSpread(
  prices: Record<string, any> | null | undefined,
  condition: string,
  gradedPrices?: Record<string, any> | null,
): number {
  if (!prices) return 0.3;

  const low = prices[condition]?.low;
  const market = prices[condition]?.market;

  if (low && market && market > 0) {
    return Math.min(low / market, 1.0);
  }

  // Try graded prices as a fallback signal for spread
  if (gradedPrices) {
    for (const gp of Object.values(gradedPrices) as any[]) {
      if (gp?.low && gp?.market && gp.market > 0) {
        return Math.min(gp.low / gp.market, 1.0);
      }
    }
  }

  return 0.3; // neutral default when data is missing
}
