import { describe, it, expect } from 'vitest';
import { scoreSupply, scoreSold } from '../../services/liquidity/tier2-signals.js';

describe('tier2-signals', () => {
  describe('scoreSupply', () => {
    it('returns 0.0 for no supply', () => {
      expect(scoreSupply(0)).toBe(0.0);
    });

    it('scales linearly', () => {
      expect(scoreSupply(1)).toBeCloseTo(0.2);
      expect(scoreSupply(3)).toBeCloseTo(0.6);
    });

    it('caps at 1.0 for 5+ listings', () => {
      expect(scoreSupply(5)).toBe(1.0);
      expect(scoreSupply(10)).toBe(1.0);
    });
  });

  describe('scoreSold', () => {
    it('returns 0.0 for no sales', () => {
      expect(scoreSold(0)).toBe(0.0);
    });

    it('scales linearly', () => {
      expect(scoreSold(1)).toBeCloseTo(0.333, 2);
      expect(scoreSold(2)).toBeCloseTo(0.667, 2);
    });

    it('caps at 1.0 for 3+ sold', () => {
      expect(scoreSold(3)).toBe(1.0);
      expect(scoreSold(10)).toBe(1.0);
    });
  });
});
