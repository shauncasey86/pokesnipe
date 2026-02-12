import { describe, it, expect } from 'vitest';
import { scoreTrendActivity, scorePriceCompleteness, scorePriceSpread } from '../../services/liquidity/tier1-signals.js';

describe('tier1-signals', () => {
  describe('scoreTrendActivity', () => {
    it('returns 1.0 when all 6 windows have movement', () => {
      expect(scoreTrendActivity({
        '1d': { percent_change: 1.2 },
        '7d': { percent_change: -2.5 },
        '14d': { percent_change: 3.0 },
        '30d': { percent_change: 5.0 },
        '90d': { percent_change: 12.0 },
        '180d': { percent_change: 8.0 },
      })).toBe(1.0);
    });

    it('returns 0.5 when 3/6 windows have movement', () => {
      expect(scoreTrendActivity({
        '1d': { percent_change: 0 },
        '7d': { percent_change: 4.8 },
        '14d': { percent_change: 0 },
        '30d': { percent_change: 0 },
        '90d': { percent_change: 20 },
        '180d': { percent_change: 5 },
      })).toBe(0.5);
    });

    it('returns 0.0 for null/undefined trends', () => {
      expect(scoreTrendActivity(null)).toBe(0);
      expect(scoreTrendActivity(undefined)).toBe(0);
    });

    it('returns 0.0 when all windows are zero', () => {
      expect(scoreTrendActivity({
        '1d': { percent_change: 0 },
        '7d': { percent_change: 0 },
        '14d': { percent_change: 0 },
        '30d': { percent_change: 0 },
        '90d': { percent_change: 0 },
        '180d': { percent_change: 0 },
      })).toBe(0.0);
    });

    it('scores partial windows (4 of 6 original windows)', () => {
      // Old 4-window data should score 4/6 = 0.667
      expect(scoreTrendActivity({
        '1d': { percent_change: 1.2 },
        '7d': { percent_change: -2.5 },
        '30d': { percent_change: 5.0 },
        '90d': { percent_change: 12.0 },
      })).toBeCloseTo(4 / 6);
    });
  });

  describe('scorePriceCompleteness', () => {
    it('returns 1.0 when all 4 conditions are priced', () => {
      expect(scorePriceCompleteness({
        NM: { market: 52 },
        LP: { market: 38 },
        MP: { market: 24 },
        HP: { market: 12 },
      })).toBe(1.0);
    });

    it('returns 0.25 when only NM is priced', () => {
      expect(scorePriceCompleteness({ NM: { market: 52 } })).toBe(0.25);
    });

    it('returns 0.0 for null/undefined prices', () => {
      expect(scorePriceCompleteness(null)).toBe(0);
      expect(scorePriceCompleteness(undefined)).toBe(0);
    });

    it('ignores conditions with market = 0', () => {
      expect(scorePriceCompleteness({
        NM: { market: 52 },
        LP: { market: 0 },
      })).toBe(0.25);
    });

    it('adds bonus for graded price data', () => {
      const score = scorePriceCompleteness(
        { NM: { market: 52 } },
        { PSA_10: { market: 280 } },
      );
      expect(score).toBe(0.5); // 0.25 raw + 0.25 graded bonus
    });

    it('caps at 1.0 with graded bonus', () => {
      const score = scorePriceCompleteness(
        { NM: { market: 52 }, LP: { market: 38 }, MP: { market: 24 }, HP: { market: 12 } },
        { PSA_10: { market: 280 } },
      );
      expect(score).toBe(1.0); // Already 1.0, bonus doesn't exceed
    });
  });

  describe('scorePriceSpread', () => {
    it('returns 1.0 for tight spread (low = market)', () => {
      expect(scorePriceSpread({ NM: { low: 50, market: 50 } }, 'NM')).toBe(1.0);
    });

    it('returns ratio for normal spread', () => {
      expect(scorePriceSpread({ NM: { low: 40, market: 50 } }, 'NM')).toBeCloseTo(0.8);
    });

    it('returns 0.3 default when data is missing', () => {
      expect(scorePriceSpread(null, 'NM')).toBe(0.3);
      expect(scorePriceSpread({ NM: {} }, 'NM')).toBe(0.3);
    });

    it('caps at 1.0 even if low > market', () => {
      expect(scorePriceSpread({ NM: { low: 60, market: 50 } }, 'NM')).toBe(1.0);
    });

    it('falls back to graded prices for spread', () => {
      expect(scorePriceSpread(
        { LP: {} },
        'LP',
        { PSA_10: { low: 200, market: 280 } },
      )).toBeCloseTo(200 / 280);
    });
  });
});
