import { describe, it, expect } from 'vitest';
import { compositeScore, assignGrade } from '../../services/liquidity/composite.js';

describe('composite liquidity', () => {
  describe('compositeScore', () => {
    it('returns high score for all strong signals with velocity', () => {
      const score = compositeScore({
        trendActivity: 1.0,
        priceCompleteness: 1.0,
        priceSpread: 0.9,
        supply: 0.8,
        sold: 0.7,
        velocity: 0.95,
      });
      expect(score).toBeGreaterThan(0.75);
    });

    it('returns low score for all weak signals without velocity', () => {
      const score = compositeScore({
        trendActivity: 0.0,
        priceCompleteness: 0.25,
        priceSpread: 0.1,
        supply: 0.0,
        sold: 0.0,
        velocity: null,
      });
      expect(score).toBeLessThan(0.25);
    });

    it('redistributes weights when velocity is null', () => {
      const withVelocity = compositeScore({
        trendActivity: 0.5, priceCompleteness: 0.5, priceSpread: 0.5,
        supply: 0.5, sold: 0.5, velocity: 0.5,
      });
      const withoutVelocity = compositeScore({
        trendActivity: 0.5, priceCompleteness: 0.5, priceSpread: 0.5,
        supply: 0.5, sold: 0.5, velocity: null,
      });
      // Both should equal 0.5 when all inputs are 0.5
      expect(withVelocity).toBeCloseTo(0.5);
      expect(withoutVelocity).toBeCloseTo(0.5);
    });
  });

  describe('assignGrade', () => {
    it('assigns high for >=0.75', () => {
      expect(assignGrade(0.75)).toBe('high');
      expect(assignGrade(0.90)).toBe('high');
    });

    it('assigns medium for >=0.50', () => {
      expect(assignGrade(0.50)).toBe('medium');
      expect(assignGrade(0.74)).toBe('medium');
    });

    it('assigns low for >=0.25', () => {
      expect(assignGrade(0.25)).toBe('low');
      expect(assignGrade(0.49)).toBe('low');
    });

    it('assigns illiquid for <0.25', () => {
      expect(assignGrade(0.24)).toBe('illiquid');
      expect(assignGrade(0.0)).toBe('illiquid');
    });
  });
});
