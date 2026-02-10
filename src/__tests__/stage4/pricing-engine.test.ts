import { describe, expect, it } from 'vitest';
import { calculateProfit } from '../../services/pricing/pricing-engine.js';

describe('calculateProfit', () => {
  it('calculates a profitable deal', () => {
    const result = calculateProfit({
      ebayPriceGBP: 12.5,
      shippingGBP: 1.99,
      condition: 'NM',
      variantPrices: { NM: { low: 45, market: 52 } },
      exchangeRate: 0.789,
    });

    expect(result).not.toBeNull();
    expect(result!.totalCostGBP).toBeGreaterThan(14); // 12.50 + 1.99 + fee
    expect(result!.marketValueUSD).toBe(52);
    expect(result!.profitGBP).toBeGreaterThan(0);
    expect(result!.profitPercent).toBeGreaterThan(0);
  });

  it('calculates a loss when eBay price exceeds market value', () => {
    const loss = calculateProfit({
      ebayPriceGBP: 100,
      shippingGBP: 5,
      condition: 'NM',
      variantPrices: { NM: { low: 45, market: 52 } },
      exchangeRate: 0.789,
    });

    expect(loss).not.toBeNull();
    expect(loss!.profitGBP).toBeLessThan(0);
    expect(loss!.profitPercent).toBeLessThan(0);
  });

  it('uses condition-specific price: LP listing uses LP price, not NM', () => {
    const lpResult = calculateProfit({
      ebayPriceGBP: 12.5,
      shippingGBP: 1.99,
      condition: 'LP',
      variantPrices: {
        NM: { low: 45, market: 52 },
        LP: { low: 30, market: 38 },
      },
      exchangeRate: 0.789,
    });

    expect(lpResult).not.toBeNull();
    expect(lpResult!.marketValueUSD).toBe(38); // Used LP, not NM
  });

  it('falls back to LP when MP condition price is missing', () => {
    const fallback = calculateProfit({
      ebayPriceGBP: 10,
      shippingGBP: 1,
      condition: 'MP',
      variantPrices: { NM: { low: 45, market: 52 }, LP: { low: 30, market: 38 } },
      exchangeRate: 0.789,
    });

    expect(fallback).not.toBeNull();
    expect(fallback!.marketValueUSD).toBe(38); // MP missing, fell back to LP
  });

  it('returns null when no condition prices are available', () => {
    const result = calculateProfit({
      ebayPriceGBP: 10,
      shippingGBP: 1,
      condition: 'NM',
      variantPrices: {},
      exchangeRate: 0.789,
    });

    expect(result).toBeNull();
  });

  it('includes complete breakdown', () => {
    const result = calculateProfit({
      ebayPriceGBP: 25,
      shippingGBP: 2.5,
      condition: 'NM',
      variantPrices: { NM: { low: 80, market: 100 } },
      exchangeRate: 0.8,
    });

    expect(result).not.toBeNull();
    expect(result!.breakdown.ebayPrice).toBe(25);
    expect(result!.breakdown.shipping).toBe(2.5);
    expect(result!.breakdown.fee).toBeGreaterThan(0);
    expect(result!.breakdown.fxRate).toBe(0.8);
    expect(result!.breakdown.marketUSD).toBe(100);
    expect(result!.breakdown.marketGBP).toBe(80);
  });
});
