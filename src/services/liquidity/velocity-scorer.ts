/**
 * Pure scoring function and types for velocity data.
 * Separated from tier3-velocity.ts to avoid I/O dependency chain in tests.
 */

export interface VelocityData {
  sales7d: number;
  sales30d: number;
  medianPrice: number | null;
  avgDaysBetweenSales: number | null;
  fetched: boolean;
}

/**
 * Score the sales velocity — how actively is this card being sold?
 */
export function scoreVelocity(velocityData: VelocityData | null): number {
  if (!velocityData?.fetched) return 0.5; // neutral default when no data

  if (velocityData.sales7d >= 5) return 1.0;
  if (velocityData.sales7d >= 2) return 0.85;
  if (velocityData.sales30d >= 5) return 0.7;
  if (velocityData.sales30d >= 2) return 0.5;
  if (velocityData.sales30d >= 1) return 0.3;
  return 0.1;
}
