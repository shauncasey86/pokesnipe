export interface PhaseOneMatch {
  titleOnlyProfitPercent: number;
  confidence: { composite: number };
  isDuplicate: boolean;
}

export interface BudgetStatus {
  remaining: number;
}

/**
 * Should we spend a getItem() call on this listing?
 *
 * Normal mode: 15% profit threshold
 * Low budget mode (<500 remaining): 25% profit threshold
 *
 * Also requires minimum confidence of 0.50 and not a duplicate.
 */
export function shouldEnrich(match: PhaseOneMatch, budget: BudgetStatus): boolean {
  // If budget is low (<500 remaining), raise the threshold
  const profitThreshold = budget.remaining < 500 ? 25 : 15;

  return (
    match.titleOnlyProfitPercent >= profitThreshold &&
    match.confidence.composite >= 0.50 &&
    !match.isDuplicate
  );
}
