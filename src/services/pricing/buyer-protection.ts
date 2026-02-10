/**
 * eBay Buyer Protection fee calculator (UK tiered bands).
 *
 * Tiers:
 *   First  £10.00:           3%
 *   £10.01 – £50.00:         5%
 *   £50.01 – £500.00:        4%
 *   £500.01+:                2%
 *   Plus flat fee:           £0.10 per transaction
 */

const BANDS: { ceiling: number; rate: number }[] = [
  { ceiling: 10, rate: 0.03 },
  { ceiling: 50, rate: 0.05 },
  { ceiling: 500, rate: 0.04 },
  { ceiling: Infinity, rate: 0.02 },
];

const FLAT_FEE = 0.1;

export function calculateBuyerProtection(itemPriceGBP: number): number {
  if (itemPriceGBP <= 0) return 0;

  let remaining = itemPriceGBP;
  let fee = 0;
  let prev = 0;

  for (const band of BANDS) {
    const bandWidth = band.ceiling - prev;
    const taxable = Math.min(remaining, bandWidth);
    fee += taxable * band.rate;
    remaining -= taxable;
    prev = band.ceiling;
    if (remaining <= 0) break;
  }

  return fee + FLAT_FEE;
}
