/**
 * Tier 2 Liquidity Signals — Free (from eBay listing data)
 *
 * These signals use data from the current scan batch and individual listings.
 * No API calls required.
 */

/**
 * Score concurrent supply: how many other eBay listings exist for this card
 * in the current scan batch?
 *
 * More supply = more sellers = more liquid market.
 * Linear scale capped at 5: 0→0.0, 1→0.2, 2→0.4, ..., 5+→1.0
 *
 * @param listingsForSameCard - Count of listings matching the same card in the scan batch
 * @returns Score 0.0–1.0
 */
export function scoreSupply(listingsForSameCard: number): number {
  return Math.min(listingsForSameCard / 5, 1.0);
}

/**
 * Score quantity sold: eBay's quantitySold field from the listing.
 * More sales from a single listing = active demand.
 *
 * Linear scale capped at 3: 0→0.0, 1→0.33, 2→0.67, 3+→1.0
 *
 * @param quantitySold - eBay's quantitySold value from the listing
 * @returns Score 0.0–1.0
 */
export function scoreSold(quantitySold: number): number {
  return Math.min(quantitySold / 3, 1.0);
}
