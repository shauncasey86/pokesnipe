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
    expect(result!.priceSource).toBe('raw');
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

  // ── Graded card pricing tests ────────────────────────────────────────

  it('uses graded price for PSA 10 card instead of raw NM', () => {
    const result = calculateProfit({
      ebayPriceGBP: 150,
      shippingGBP: 5,
      condition: 'NM',
      variantPrices: { NM: { low: 45, market: 52 } },
      exchangeRate: 0.789,
      isGraded: true,
      gradingCompany: 'PSA',
      grade: '10',
      gradedPrices: {
        PSA_10: { low: 200, market: 280 },
        PSA_9: { low: 90, market: 120 },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.marketValueUSD).toBe(280); // Graded PSA 10 price, NOT raw NM 52
    expect(result!.priceSource).toBe('graded');
    expect(result!.profitGBP).toBeGreaterThan(0); // 280 * 0.789 = 220.92 GBP >> 155+fee
  });

  it('uses graded price for CGC 9.5 card', () => {
    const result = calculateProfit({
      ebayPriceGBP: 80,
      shippingGBP: 3,
      condition: 'NM',
      variantPrices: { NM: { low: 45, market: 52 } },
      exchangeRate: 0.789,
      isGraded: true,
      gradingCompany: 'CGC',
      grade: '9.5',
      gradedPrices: {
        PSA_10: { low: 200, market: 280 },
        'CGC_9.5': { low: 100, market: 140 },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.marketValueUSD).toBe(140); // CGC 9.5 price
    expect(result!.priceSource).toBe('graded');
  });

  it('falls back to raw NM when graded price not found for specific grade', () => {
    const result = calculateProfit({
      ebayPriceGBP: 30,
      shippingGBP: 2,
      condition: 'NM',
      variantPrices: { NM: { low: 45, market: 52 } },
      exchangeRate: 0.789,
      isGraded: true,
      gradingCompany: 'BGS',
      grade: '9',
      gradedPrices: {
        PSA_10: { low: 200, market: 280 },
        // No BGS_9 entry
      },
    });

    expect(result).not.toBeNull();
    expect(result!.marketValueUSD).toBe(52); // Fell back to raw NM
    expect(result!.priceSource).toBe('raw');
  });

  it('falls back to raw when gradedPrices is null', () => {
    const result = calculateProfit({
      ebayPriceGBP: 30,
      shippingGBP: 2,
      condition: 'NM',
      variantPrices: { NM: { low: 45, market: 52 } },
      exchangeRate: 0.789,
      isGraded: true,
      gradingCompany: 'PSA',
      grade: '10',
      gradedPrices: null,
    });

    expect(result).not.toBeNull();
    expect(result!.marketValueUSD).toBe(52); // No graded data, fell back to raw
    expect(result!.priceSource).toBe('raw');
  });

  it('uses raw price when isGraded is false even if gradedPrices exist', () => {
    const result = calculateProfit({
      ebayPriceGBP: 12.5,
      shippingGBP: 1.99,
      condition: 'NM',
      variantPrices: { NM: { low: 45, market: 52 } },
      exchangeRate: 0.789,
      isGraded: false,
      gradedPrices: {
        PSA_10: { low: 200, market: 280 },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.marketValueUSD).toBe(52); // Raw price, not graded
    expect(result!.priceSource).toBe('raw');
  });

  it('returns null when graded card has no graded price and no raw prices', () => {
    const result = calculateProfit({
      ebayPriceGBP: 150,
      shippingGBP: 5,
      condition: 'NM',
      variantPrices: {},
      exchangeRate: 0.789,
      isGraded: true,
      gradingCompany: 'PSA',
      grade: '10',
      gradedPrices: {},
    });

    expect(result).toBeNull();
  });

  it('graded deal correctly shows loss when eBay price exceeds graded value', () => {
    const result = calculateProfit({
      ebayPriceGBP: 300,
      shippingGBP: 10,
      condition: 'NM',
      variantPrices: { NM: { low: 45, market: 52 } },
      exchangeRate: 0.789,
      isGraded: true,
      gradingCompany: 'PSA',
      grade: '10',
      gradedPrices: {
        PSA_10: { low: 200, market: 280 },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.marketValueUSD).toBe(280);
    expect(result!.priceSource).toBe('graded');
    expect(result!.profitGBP).toBeLessThan(0); // 280 * 0.789 = 220.92 < 310+fee
  });
});
