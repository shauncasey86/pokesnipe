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
 * Checks 4 windows: 1d, 7d, 30d, 90d
 * Score = count of non-zero windows / 4
 *
 * @param trends - The variant's trends data for a specific condition (e.g. trends.NM)
 *   Shape: { '1d': { percent_change: number }, '7d': { ... }, '30d': { ... }, '90d': { ... } }
 * @returns Score 0.0–1.0
 */
export function scoreTrendActivity(trends: Record<string, any> | null | undefined): number {
  if (!trends) return 0;

  const windows = ['1d', '7d', '30d', '90d'];
  const activeWindows = windows.filter(w => {
    const pct = trends[w]?.percent_change ?? trends[w]?.pct;
    return pct !== null && pct !== undefined && pct !== 0;
  });

  return activeWindows.length / windows.length;
}

/**
 * Score price completeness: how many conditions (NM/LP/MP/HP) have market pricing?
 * More conditions priced = more widely traded = more liquid.
 *
 * @param prices - The variant's prices object
 *   Shape: { NM: { market: number, low: number }, LP: { ... }, MP: { ... }, HP: { ... } }
 *   or nested under .raw: { raw: { NM: { market: ... } } }
 * @returns Score 0.0–1.0 (0.25 per condition)
 */
export function scorePriceCompleteness(prices: Record<string, any> | null | undefined): number {
  if (!prices) return 0;

  // Handle both { NM: { market: ... } } and { raw: { NM: { market: ... } } }
  const priceMap = prices.raw || prices;

  const conditions = ['NM', 'LP', 'MP', 'HP'];
  const pricedCount = conditions.filter(c =>
    priceMap[c]?.market != null && priceMap[c].market > 0
  ).length;

  return pricedCount / conditions.length;
}

/**
 * Score price spread: how tight is the low-to-market spread for this condition?
 * Tight spread (low ≈ market) = 1.0 — liquid, prices are stable
 * Wide spread (low << market) = lower score — volatile or thin market
 *
 * @param prices - The variant's prices object
 * @param condition - The condition to check (NM/LP/MP/HP)
 * @returns Score 0.0–1.0 (defaults to 0.3 if data missing)
 */
export function scorePriceSpread(
  prices: Record<string, any> | null | undefined,
  condition: string
): number {
  if (!prices) return 0.3;

  const priceMap = prices.raw || prices;
  const low = priceMap[condition]?.low;
  const market = priceMap[condition]?.market;

  if (low && market && market > 0) {
    return Math.min(low / market, 1.0);
  }

  return 0.3; // neutral default when data is missing
}
