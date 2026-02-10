import { calculateBuyerProtection } from './buyer-protection.js';

type Condition = 'NM' | 'LP' | 'MP' | 'HP';

interface ConditionPrice {
  low: number;
  market: number;
}

export interface ProfitInput {
  ebayPriceGBP: number;
  shippingGBP: number;
  condition: Condition;
  variantPrices: Partial<Record<Condition, ConditionPrice>>;
  exchangeRate: number;
}

export interface ProfitResult {
  totalCostGBP: number;
  buyerProtectionFee: number;
  marketValueUSD: number;
  marketValueGBP: number;
  profitGBP: number;
  profitPercent: number;
  breakdown: {
    ebayPrice: number;
    shipping: number;
    fee: number;
    totalCost: number;
    marketUSD: number;
    fxRate: number;
    marketGBP: number;
    profit: number;
  };
}

/**
 * Resolve the market price for the given condition, falling back through
 * LP → MP → HP if the exact condition is unavailable.
 */
function resolveMarketPrice(
  condition: Condition,
  prices: Partial<Record<Condition, ConditionPrice>>,
): number | null {
  // Try the exact condition first
  if (prices[condition]?.market != null) {
    return prices[condition]!.market;
  }

  // Fallback chain: LP → MP → HP
  const fallbacks: Condition[] = ['LP', 'MP', 'HP'];
  for (const fb of fallbacks) {
    if (fb !== condition && prices[fb]?.market != null) {
      return prices[fb]!.market;
    }
  }

  return null;
}

export function calculateProfit(input: ProfitInput): ProfitResult | null {
  const { ebayPriceGBP, shippingGBP, condition, variantPrices, exchangeRate } = input;

  const marketValueUSD = resolveMarketPrice(condition, variantPrices);
  if (marketValueUSD == null) return null;

  const buyerProtectionFee = calculateBuyerProtection(ebayPriceGBP);
  const totalCostGBP = ebayPriceGBP + shippingGBP + buyerProtectionFee;
  const marketValueGBP = marketValueUSD * exchangeRate;
  const profitGBP = marketValueGBP - totalCostGBP;
  const profitPercent = totalCostGBP > 0 ? (profitGBP / totalCostGBP) * 100 : 0;

  return {
    totalCostGBP,
    buyerProtectionFee,
    marketValueUSD,
    marketValueGBP,
    profitGBP,
    profitPercent,
    breakdown: {
      ebayPrice: ebayPriceGBP,
      shipping: shippingGBP,
      fee: buyerProtectionFee,
      totalCost: totalCostGBP,
      marketUSD: marketValueUSD,
      fxRate: exchangeRate,
      marketGBP: marketValueGBP,
      profit: profitGBP,
    },
  };
}
