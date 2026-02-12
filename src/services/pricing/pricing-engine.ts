import { calculateBuyerProtection } from './buyer-protection.js';

type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'DM';

interface ConditionPrice {
  low: number;
  market: number;
}

interface GradedPrice {
  low: number;
  market: number;
  mid?: number;
  high?: number;
}

export interface ProfitInput {
  ebayPriceGBP: number;
  shippingGBP: number;
  condition: Condition;
  variantPrices: Partial<Record<Condition, ConditionPrice>>;
  exchangeRate: number;
  // Graded card pricing — when present and matched, takes priority over raw prices
  isGraded?: boolean;
  gradingCompany?: string;
  grade?: string;
  gradedPrices?: Record<string, GradedPrice> | null;
}

export interface ProfitResult {
  totalCostGBP: number;
  buyerProtectionFee: number;
  marketValueUSD: number;
  marketValueGBP: number;
  profitGBP: number;
  profitPercent: number;
  lowValueUSD: number | null;
  lowValueGBP: number | null;
  conservativeProfitGBP: number | null;
  priceSource: 'graded' | 'raw';
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
 * Resolve the graded market price for the given company + grade.
 * Key format in gradedPrices is "{COMPANY}_{GRADE}" (e.g., "PSA_10", "CGC_9.5").
 */
function resolveGradedPrice(
  gradingCompany: string,
  grade: string,
  gradedPrices: Record<string, GradedPrice>,
): number | null {
  const key = `${gradingCompany}_${grade}`;
  if (gradedPrices[key]?.market != null) {
    return gradedPrices[key]!.market;
  }
  return null;
}

/**
 * Resolve the market price for the given condition, falling back through
 * NM → LP → MP → HP → DM if the exact condition is unavailable.
 */
function resolveMarketPrice(
  condition: Condition,
  prices: Partial<Record<Condition, ConditionPrice>>,
): number | null {
  // Try the exact condition first
  if (prices[condition]?.market != null) {
    return prices[condition]!.market;
  }

  // Fallback chain: NM → LP → MP → HP → DM
  const fallbacks: Condition[] = ['NM', 'LP', 'MP', 'HP', 'DM'];
  for (const fb of fallbacks) {
    if (fb !== condition && prices[fb]?.market != null) {
      return prices[fb]!.market;
    }
  }

  return null;
}

/**
 * Resolve the low price for the given condition (conservative estimate).
 */
function resolveLowPrice(
  condition: Condition,
  prices: Partial<Record<Condition, ConditionPrice>>,
): number | null {
  if (prices[condition]?.low != null) {
    return prices[condition]!.low;
  }
  return null;
}

export function calculateProfit(input: ProfitInput): ProfitResult | null {
  const {
    ebayPriceGBP, shippingGBP, condition, variantPrices, exchangeRate,
    isGraded, gradingCompany, grade, gradedPrices,
  } = input;

  let marketValueUSD: number | null = null;
  let priceSource: 'graded' | 'raw' = 'raw';

  // For graded cards, try graded price first
  if (isGraded && gradingCompany && grade && gradedPrices) {
    marketValueUSD = resolveGradedPrice(gradingCompany, grade, gradedPrices);
    if (marketValueUSD != null) {
      priceSource = 'graded';
    }
  }

  // Fall back to raw condition prices if graded price not found
  if (marketValueUSD == null) {
    marketValueUSD = resolveMarketPrice(condition, variantPrices);
  }

  if (marketValueUSD == null) return null;

  const buyerProtectionFee = calculateBuyerProtection(ebayPriceGBP);
  const totalCostGBP = ebayPriceGBP + shippingGBP + buyerProtectionFee;
  const marketValueGBP = marketValueUSD * exchangeRate;
  const profitGBP = marketValueGBP - totalCostGBP;
  const profitPercent = totalCostGBP > 0 ? (profitGBP / totalCostGBP) * 100 : 0;

  // Conservative estimate using low price
  let lowValueUSD: number | null = null;
  let lowValueGBP: number | null = null;
  let conservativeProfitGBP: number | null = null;
  if (priceSource === 'graded' && isGraded && gradingCompany && grade && gradedPrices) {
    const key = `${gradingCompany}_${grade}`;
    if (gradedPrices[key]?.low != null) {
      lowValueUSD = gradedPrices[key]!.low;
    }
  } else {
    lowValueUSD = resolveLowPrice(condition, variantPrices);
  }
  if (lowValueUSD != null) {
    lowValueGBP = lowValueUSD * exchangeRate;
    conservativeProfitGBP = lowValueGBP - totalCostGBP;
  }

  return {
    totalCostGBP,
    buyerProtectionFee,
    marketValueUSD,
    marketValueGBP,
    profitGBP,
    profitPercent,
    lowValueUSD,
    lowValueGBP,
    conservativeProfitGBP,
    priceSource,
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
