import { describe, it, expect } from 'vitest';
import { scoreTrendActivity, scorePriceCompleteness, scorePriceSpread } from '../../services/liquidity/tier1-signals.js';

describe('tier1-signals', () => {
  describe('scoreTrendActivity', () => {
    it('returns 1.0 when all 4 windows have movement', () => {
      expect(scoreTrendActivity({
        '1d': { percent_change: 1.2 },
        '7d': { percent_change: -2.5 },
        '30d': { percent_change: 5.0 },
        '90d': { percent_change: 12.0 },
      })).toBe(1.0);
    });

    it('returns 0.5 when 2/4 windows have movement', () => {
      expect(scoreTrendActivity({
        '1d': { percent_change: 0 },
        '7d': { percent_change: 4.8 },
        '30d': { percent_change: 0 },
        '90d': { percent_change: 20 },
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
        '30d': { percent_change: 0 },
        '90d': { percent_change: 0 },
      })).toBe(0.0);
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

    it('handles nested .raw structure', () => {
      expect(scorePriceCompleteness({
        raw: { NM: { market: 52 }, LP: { market: 38 } }
      })).toBe(0.5);
    });

    it('ignores conditions with market = 0', () => {
      expect(scorePriceCompleteness({
        NM: { market: 52 },
        LP: { market: 0 },
      })).toBe(0.25);
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
  });
});
