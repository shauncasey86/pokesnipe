/**
 * eBay Buyer Protection fee calculator (UK tiered bands).
 *
 * Tiers:
 *   Up to £20:               7%
 *   £20.01 – £300:           4%
 *   £300.01 – £4,000:        2%
 *   Over £4,000:             0% (no additional fee)
 *   Plus flat fee:           £0.10 per item
 */

const BANDS: { ceiling: number; rate: number }[] = [
  { ceiling: 20, rate: 0.07 },
  { ceiling: 300, rate: 0.04 },
  { ceiling: 4000, rate: 0.02 },
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
